import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Motor } from '../../data/duckdb';
import { compilar } from '../../query/compiler';
import { ErroPlanilha, lerPlanilha, type BancoUniversal, type LeituraPlanilha } from '../../universal/carregar';
import { aplicarModelo, buscarModelo, criarModelo, impressaoDigital, salvarModelo } from '../../universal/impressao';
import { descartar, montarGrupo, type Grupo, type ParteGrupo, type PlanilhaMontada } from '../../universal/montar';
import { configPadrao, type ColunaConfig } from '../../universal/perfil';
import { sugerirLigacoes, type Ligacao } from '../../universal/relacoes';
import { guardarUltima, type ArquivoGuardado } from '../../universal/ultima';
import { DashboardPlanilha } from './DashboardPlanilha';
import { EntendiAssim, type KpiPrevia } from './EntendiAssim';
import { Entrada } from './Entrada';
import { Relacoes } from './Relacoes';

type Etapa =
  | { tipo: 'entrada'; erro?: { mensagem: string; dica?: string } }
  | { tipo: 'lendo'; nomes: string[] }
  | { tipo: 'relacoes'; leituras: LeituraPlanilha[]; ligacoes: Ligacao[] }
  | { tipo: 'revisao'; grupo: Grupo }
  | { tipo: 'pronto'; grupo: Grupo; montada: PlanilhaMontada; reconhecido: string | null };

function parte(leitura: LeituraPlanilha, ligacao?: Ligacao): ParteGrupo {
  const modelo = buscarModelo(impressaoDigital(leitura.perfis));
  const salvo = modelo ? aplicarModelo(modelo, leitura.perfis) : null;
  return { leitura, config: salvo ?? configPadrao(leitura.perfis), ligacao, reconhecido: salvo && modelo ? modelo : undefined };
}

const nomeDoGrupo = (g: Grupo) => [g.principal, ...g.juntas].map((p) => p.leitura.nome.replace(/\.[a-z0-9]+$/i, '')).join(' + ');

/** Modo Universal: arrastar -> (ligações) -> "Entendi assim" -> dashboard automático. */
export function PaginaPlanilha({ motor, aoVerDemo }: { motor: Motor; aoVerDemo: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'entrada' });
  const [previa, setPrevia] = useState<KpiPrevia[] | 'calculando' | { erro: string }>('calculando');
  const [gerando, setGerando] = useState(false);
  const montagemPrevia = useRef<PlanilhaMontada | null>(null);
  const banco = useMemo<BancoUniversal>(
    () => ({ leParquet: motor.fonte.tipo === 'parquet', registrarArquivo: motor.registrarArquivo, executar: motor.executar }),
    [motor],
  );

  useEffect(() => {
    if (etapa.tipo !== 'pronto') document.title = 'Sua planilha · Modo Universal · Modo IA local';
  }, [etapa.tipo]);

  const irParaDashboard = useCallback(
    async (grupo: Grupo, reconhecido: string | null) => {
      const montada = await montarGrupo(grupo, banco);
      performance.mark('planilha-dashboard');
      setEtapa({ tipo: 'pronto', grupo, montada, reconhecido });
    },
    [banco],
  );

  const escolher = useCallback(
    async (arquivos: ArquivoGuardado[]) => {
      if (!arquivos.length) return;
      setEtapa({ tipo: 'lendo', nomes: arquivos.map((a) => a.nome) });
      try {
        const leituras: LeituraPlanilha[] = [];
        for (const a of arquivos) leituras.push(await lerPlanilha(a, banco));
        void guardarUltima(arquivos).catch(() => undefined);
        performance.mark('planilha-lida');
        if (leituras.length > 1) {
          setEtapa({ tipo: 'relacoes', leituras, ligacoes: await sugerirLigacoes(leituras, banco) });
          return;
        }
        const [unica] = leituras;
        if (!unica) return;
        const grupo: Grupo = { principal: parte(unica), juntas: [] };
        // Layout conhecido ("joga e pronto"): pula a revisão.
        if (grupo.principal.reconhecido) await irParaDashboard(grupo, grupo.principal.reconhecido.nome);
        else setEtapa({ tipo: 'revisao', grupo });
      } catch (e) {
        setEtapa({ tipo: 'entrada', erro: { mensagem: e instanceof Error ? e.message : String(e), dica: e instanceof ErroPlanilha ? e.dica : undefined } });
      }
    },
    [banco, irParaDashboard],
  );

  // Prévia dos KPIs na tela "Entendi assim": remonta (com pausa curta) a cada mudança de configuração.
  const grupoRevisao = etapa.tipo === 'revisao' ? etapa.grupo : null;
  useEffect(() => {
    if (!grupoRevisao) return;
    let vivo = true;
    setPrevia('calculando');
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const antiga = montagemPrevia.current;
          const m = await montarGrupo(grupoRevisao, banco);
          montagemPrevia.current = m;
          if (antiga) await descartar(antiga, banco);
          const kpis = m.painel.kpis.slice(0, 4);
          const { sql } = compilar({ intent: 'kpi', metrics: kpis.map((k) => k.metrica), dimensions: [], filters: [] }, m.semantica);
          const [linha] = await banco.executar(sql);
          if (vivo) {
            setPrevia(
              kpis.map((k) => {
                const def = m.semantica.metrics[k.metrica];
                const v = linha?.[k.metrica];
                return { rotulo: def?.label ?? k.metrica, formato: def?.format ?? 'dec2', valor: typeof v === 'number' ? v : null };
              }),
            );
          }
        } catch (e) {
          if (vivo) setPrevia({ erro: `Não consegui calcular com essa configuração: ${e instanceof Error ? e.message : String(e)}` });
        }
      })();
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [grupoRevisao, banco]);

  const mudarConfig = (qual: 'principal' | number, config: ColunaConfig[]) => {
    if (etapa.tipo !== 'revisao') return;
    const g = etapa.grupo;
    const grupo: Grupo = qual === 'principal' ? { ...g, principal: { ...g.principal, config } } : { ...g, juntas: g.juntas.map((j, i) => (i === qual ? { ...j, config } : j)) };
    setEtapa({ tipo: 'revisao', grupo });
  };

  const gerar = async (lembrar: boolean) => {
    if (etapa.tipo !== 'revisao') return;
    setGerando(true);
    try {
      if (lembrar) {
        for (const p of [etapa.grupo.principal, ...etapa.grupo.juntas]) {
          salvarModelo(criarModelo(p.leitura.nome.replace(/\.[a-z0-9]+$/i, ''), impressaoDigital(p.leitura.perfis), p.config));
        }
      }
      await irParaDashboard(etapa.grupo, null);
    } catch (e) {
      setPrevia({ erro: e instanceof Error ? e.message : String(e) });
    } finally {
      setGerando(false);
    }
  };

  const voltar = () => setEtapa({ tipo: 'entrada' });

  return (
    <div className="pagina-planilha">
      {etapa.tipo === 'entrada' && <Entrada aoEscolher={(a) => void escolher(a)} aoVerDemo={aoVerDemo} erro={etapa.erro} leParquet={banco.leParquet} />}
      {etapa.tipo === 'lendo' && (
        <div className="carregando-app" role="status" aria-live="polite">
          <h1>Lendo {etapa.nomes.join(' + ')}…</h1>
          <p>Codificação, separador, cabeçalho, limpeza e perfil das colunas, tudo no seu navegador.</p>
          <div className="barra-progresso" aria-hidden="true">
            <span />
          </div>
        </div>
      )}
      {etapa.tipo === 'relacoes' && (
        <Relacoes
          leituras={etapa.leituras}
          ligacoes={etapa.ligacoes}
          aoVoltar={voltar}
          aoConfirmar={(principal, escolhidas) => {
            const p = etapa.leituras[principal];
            if (!p) return;
            const juntas = escolhidas.map((l) => {
              const leitura = etapa.leituras[l.para.planilha];
              return leitura ? parte(leitura, l) : null;
            });
            const grupo: Grupo = { principal: parte(p), juntas: juntas.filter((j): j is ParteGrupo => j !== null) };
            setEtapa({ tipo: 'revisao', grupo });
          }}
        />
      )}
      {etapa.tipo === 'revisao' && <EntendiAssim grupo={etapa.grupo} aoMudar={mudarConfig} aoGerar={(l) => void gerar(l)} aoVoltar={voltar} previa={previa} gerando={gerando} />}
      {etapa.tipo === 'pronto' && (
        <DashboardPlanilha
          motor={motor}
          montada={etapa.montada}
          nome={nomeDoGrupo(etapa.grupo)}
          reconhecido={etapa.reconhecido}
          resumo={etapa.grupo.principal.leitura.resumo}
          aoRevisar={() => setEtapa({ tipo: 'revisao', grupo: etapa.grupo })}
          aoTrocar={voltar}
        />
      )}
    </div>
  );
}
