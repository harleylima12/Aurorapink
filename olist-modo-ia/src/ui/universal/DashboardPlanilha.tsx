import { useEffect, useMemo, useRef, useState } from 'react';

import { SEM_FILTROS } from '../../dashboard/filtros';
import type { Linha, Motor } from '../../data/duckdb';
import { formatar } from '../../format/numeros';
import { insightsDaPlanilha } from '../../modo-ia/insightsAutomaticos';
import { useIALocal } from '../../modo-ia/useIALocal';
import { useModoIA, type ExtrasModoIA } from '../../modo-ia/useModoIA';
import { ident } from '../../universal/limpeza';
import type { PlanilhaMontada } from '../../universal/montar';
import { exemplosDaPlanilha, sugestoesDaPlanilha } from '../../universal/painelAuto';
import type { ColunaConfig } from '../../universal/perfil';
import { Dados, type ContextoDados } from '../contexto';
import { KpiCard } from '../KpiCard';
import { PainelIA } from '../modo-ia/PainelIA';
import { Visual } from '../Visual';

function celula(v: Linha[string] | undefined, c: ColunaConfig | undefined): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number' && c) {
    if (c.tipo === 'dinheiro') return formatar(v, 'brl');
    if (c.tipo === 'porcentagem') return formatar(v, 'pct');
    if (c.tipo === 'data') return new Date(v).toISOString().slice(0, 10).split('-').reverse().join('/');
    return formatar(v, Number.isInteger(v) ? 'int' : 'dec2');
  }
  return String(v);
}

/** Tabela de detalhe: as primeiras 50 linhas já limpas e tipadas (dados pessoais mascarados). */
function DetalheTabela({ motor, montada }: { motor: Motor; montada: PlanilhaMontada }) {
  const sql = `SELECT * EXCLUDE (linha_planilha) FROM ${ident(montada.tabela)} ORDER BY linha_planilha LIMIT 50`;
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    motor
      .consultar(sql)
      .then((r) => vivo && setLinhas(r.linhas))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [motor, sql]);
  const colunas = montada.config.filter((c) => !(c.papel === 'ignorar' && c.tipo === 'texto'));
  return (
    <section className="painel largo" aria-labelledby="titulo-detalhe" data-visual="detalhe">
      <header className="painel-cabecalho">
        <h2 id="titulo-detalhe">Detalhe</h2>
        <p>
          Primeiras 50 de {formatar(montada.linhas, 'int')} linhas, já limpas e convertidas. Dados pessoais aparecem mascarados.
        </p>
      </header>
      {erro ? (
        <p className="erro">{erro}</p>
      ) : !linhas ? (
        <div className="esqueleto grafico-esqueleto" style={{ height: 200 }} />
      ) : (
        <div className="tabela-rolagem detalhe-rolagem">
          <table className="tabela-resposta">
            <thead>
              <tr>
                {colunas.map((c) => (
                  <th key={c.id} scope="col">
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i}>
                  {colunas.map((c) => (
                    <td key={c.id} className={['dinheiro', 'numero', 'porcentagem'].includes(c.tipo) ? 'num' : undefined}>
                      {celula(l[c.id], c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="como-calculei">
        <summary>Como calculei</summary>
        <div className="como-corpo">
          <pre>{sql}</pre>
        </div>
      </details>
    </section>
  );
}

interface Props {
  motor: Motor;
  montada: PlanilhaMontada;
  nome: string;
  reconhecido: string | null;
  resumo: string[];
  aoRevisar: () => void;
  aoTrocar: () => void;
}

/** Dashboard automático (seção 7A item 7) + Modo IA sobre a planilha. */
export function DashboardPlanilha({ motor, montada, nome, reconhecido, resumo, aoRevisar, aoTrocar }: Props) {
  const [iaAberto, setIaAberto] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const ancora = montada.periodo?.ate ?? new Date().toISOString().slice(0, 10);
  const dados = useMemo<ContextoDados>(
    () => ({ motor, semantica: montada.semantica, meta: { anos: [], ufs: [], mesesParciais: new Set<string>(), ancora } }),
    [motor, montada.semantica, ancora],
  );
  const extras = useMemo<ExtrasModoIA>(
    () => ({
      semantica: montada.semantica,
      gerarInsights: insightsDaPlanilha(montada.painel.visuais.map((v) => ({ titulo: v.titulo, spec: v.spec }))),
      exemplosIA: exemplosDaPlanilha(montada.semantica),
    }),
    [montada],
  );
  const ia = useIALocal(iaAberto);
  const modoIA = useModoIA(motor, ancora, dados.meta.mesesParciais, iaAberto, ia.motor, extras);
  const sugestoes = useMemo(() => sugestoesDaPlanilha(montada.semantica, montada.painel), [montada]);

  useEffect(() => {
    document.title = `${nome} · Modo Universal · Modo IA local`;
  }, [nome]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT');
      if (e.key === '/' && !digitando) {
        e.preventDefault();
        setIaAberto(true);
        window.setTimeout(() => campo.current?.focus(), 0);
      } else if (e.key === 'Escape') setIaAberto(false);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  return (
    <Dados.Provider value={dados}>
      <div className={`app-planilha${iaAberto ? ' com-ia' : ''}`}>
        <main className="conteudo" id="conteudo">
          <header className="topo">
            <div>
              <h1>{nome}</h1>
              <p>
                {formatar(montada.linhas, 'int')} linhas
                {montada.periodo ? ` · de ${montada.periodo.de.split('-').reverse().join('/')} a ${montada.periodo.ate.split('-').reverse().join('/')}` : ' · sem coluna de data'}
                {' · '}dashboard gerado em {formatar(montada.ms, 'int')} ms
              </p>
              {reconhecido && (
                <p className="reconhecido" role="status">
                  ✓ Reconheci o layout do modelo “{reconhecido}” e abri direto.{' '}
                  <button type="button" className="link" onClick={aoRevisar}>
                    Revisar colunas
                  </button>
                </p>
              )}
            </div>
            <div className="zona-botoes">
              <button type="button" className="botao-secundario" onClick={aoRevisar}>
                Revisar colunas
              </button>
              <button type="button" className="botao-secundario" onClick={aoTrocar}>
                Trocar planilha
              </button>
              <button
                type="button"
                className="botao-ia"
                aria-expanded={iaAberto}
                onClick={() => {
                  setIaAberto((a) => !a);
                  window.setTimeout(() => campo.current?.focus(), 0);
                }}
              >
                ✨ Modo IA <small>atalho /</small>
              </button>
            </div>
          </header>
          <section className="kpis" aria-label="Indicadores" aria-live="polite">
            {montada.painel.kpis.map((k) => (
              <KpiCard key={`${montada.tabela}-${k.metrica}`} definicao={k} filtros={SEM_FILTROS} />
            ))}
          </section>
          <div className="grade">
            {montada.painel.visuais.map((v) => (
              <Visual key={`${montada.tabela}-${v.id}`} definicao={v} filtros={SEM_FILTROS} />
            ))}
            <DetalheTabela motor={motor} montada={montada} />
          </div>
          {resumo.length > 0 && (
            <details className="painel relatorio-final">
              <summary>O que o app corrigiu na leitura</summary>
              <ul>
                {resumo.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          )}
        </main>
        {iaAberto && (
          <PainelIA
            estado={modoIA}
            ia={ia}
            aoFechar={() => setIaAberto(false)}
            campo={campo}
            sugestoes={sugestoes}
            nota={`Perguntas sobre "${nome}". Texto livre e dados pessoais ficam fora da IA.`}
          />
        )}
      </div>
    </Dados.Provider>
  );
}
