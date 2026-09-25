import type { EChartsType } from 'echarts/core';
import { useRef, useState } from 'react';

import { formatar } from '../../format/numeros';
import { buscarFato } from '../../insights/engine';
import { avaliar, desafixar, fixar } from '../../modo-ia/armazenamento';
import type { Resposta } from '../../modo-ia/responder';
import { CORES } from '../../charts/tema';
import { Grafico } from '../Grafico';

interface Props {
  resposta: Resposta;
  /** Da tecla Enter até o cartão (inclui a tela); sem ele, mostra só o tempo do cálculo. */
  msTela?: number;
  selo?: string;
  aoEscolher?: (pergunta: string) => void;
  /** No dashboard (fixados): troca "Fixar" por "Desafixar". */
  fixadoId?: string;
  /** A IA local está reescrevendo o texto (o do template fica até ela terminar e passar no validador). */
  narrando?: boolean;
}

function duracao(ms: number): string {
  return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${formatar(ms / 1000, 'dec2')} s`;
}

export function CartaoResposta({ resposta, msTela, selo, aoEscolher, fixadoId, narrando }: Props) {
  const grafico = useRef<EChartsType | null>(null);
  const [aviso, setAviso] = useState('');
  const [voto, setVoto] = useState<'bom' | 'ruim' | null>(null);
  const { tipo, texto, grafico: sel } = resposta;
  const total = buscarFato(resposta.fatos, 'total');
  const variacao = buscarFato(resposta.fatos, 'variacao_pct');

  const avisar = (m: string) => {
    setAviso(m);
    window.setTimeout(() => setAviso(''), 2500);
  };

  const exportarPng = () => {
    const url = grafico.current?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: CORES.painel });
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${texto.titulo.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase().slice(0, 60) || 'grafico'}.png`;
    link.click();
    avisar('PNG exportado');
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText([texto.titulo, ...texto.bullets.map((b) => `• ${b}`)].join('\n'));
      avisar('Texto copiado');
    } catch {
      avisar('O navegador bloqueou a área de transferência');
    }
  };

  const votar = (v: 'bom' | 'ruim') => {
    setVoto(v);
    avaliar({ pergunta: resposta.pergunta, spec: resposta.spec, voto: v, em: new Date().toISOString() });
  };

  return (
    <article
      className={`resposta resposta-${tipo}`}
      data-tipo={tipo}
      data-intent={resposta.spec.intent}
      data-modo={resposta.modo}
      data-texto={resposta.narracao.origem}
      aria-label={texto.titulo}
    >
      {selo && <p className="resposta-selo-topo">{selo}</p>}
      {resposta.pergunta && !selo && <p className="resposta-pergunta">“{resposta.pergunta}”</p>}
      <h3 className="resposta-titulo">{texto.titulo}</h3>

      {tipo === 'dados' && sel?.tipo === 'kpi' && total && (
        <p className="resposta-kpi" data-valor={total.valor}>
          {total.valor_formatado}
          {variacao && <span className={variacao.valor < 0 ? 'negativo' : 'positivo'}> {variacao.valor_formatado}</span>}
        </p>
      )}
      {tipo === 'dados' && sel?.opcoes && (
        <Grafico opcoes={sel.opcoes} rotulo={sel.descricao} altura={sel.tipo === 'barra' ? Math.min(60 + resposta.linhas.length * 22, 400) : 240} aoIniciar={(i) => (grafico.current = i)} />
      )}
      {tipo === 'dados' && sel?.tipo === 'tabela' && (
        <div className="tabela-rolagem">
          <table className="tabela-resposta">
            <thead>
              <tr>{resposta.colunas.map((c) => <th key={c.id} scope="col">{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {resposta.linhas.slice(0, 20).map((l, i) => (
                <tr key={i}>
                  {resposta.colunas.map((c) => (
                    <td key={c.id} className={c.papel === 'metrica' ? 'num' : undefined}>
                      {c.formato && typeof l[c.id] === 'number' ? formatar(l[c.id] as number, c.formato) : String(l[c.id] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {texto.bullets.length > 0 && (
        <ul className={`resposta-bullets${narrando ? ' narrando' : ''}`}>
          {texto.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}

      {resposta.sugestoes && resposta.sugestoes.length > 0 && (
        <div className="chips" role="group" aria-label="Opções">
          {resposta.sugestoes.map((s, i) => (
            <button key={s} type="button" className="chip" onClick={() => aoEscolher?.(s)}>
              {resposta.spec.clarify?.options[i] ?? s}
            </button>
          ))}
        </div>
      )}

      {narrando && <p className="nota narrando-aviso" role="status">IA local revisando o texto…</p>}
      <p className="resposta-selo" data-ms={Math.round(msTela ?? resposta.ms)}>
        respondido em {duracao(msTela ?? resposta.ms)} · <span className={`selo-modo selo-${resposta.modo}`}>{resposta.modo === 'ia' ? 'IA' : 'Modo Rápido'}</span>
        {tipo === 'dados' && resposta.confianca < 1 && resposta.modo === 'rapido' ? ` · confiança ${formatar(resposta.confianca, 'pct')}` : ''}
        {tipo === 'dados' && !narrando && resposta.narracao.modelo ? ` · texto: ${resposta.narracao.origem === 'ia' ? 'IA' : 'template'}` : ''}
      </p>

      <details className="como-calculei">
        <summary>Como calculei · {resposta.consultas.length} {resposta.consultas.length === 1 ? 'consulta' : 'consultas'} · {formatar(resposta.consultas.reduce((s, c) => s + c.ms, 0), 'dec1')} ms no DuckDB</summary>
        <div className="como-corpo">
          <h3>{resposta.modo === 'ia' ? 'Entendi assim (Camada 1, IA local)' : 'Entendi assim (Camada 0, sem IA)'}</h3>
          <pre>{resposta.rastro.join('\n') || '—'}</pre>
          {resposta.planejamento && (
            <>
              <h3>
                Saída crua do modelo · {resposta.planejamento.modelo} · {resposta.planejamento.versaoPrompt} · {duracao(resposta.planejamento.ms)} · prompt com{' '}
                {formatar(resposta.planejamento.caracteresPrompt, 'int')} caracteres
              </h3>
              <pre>{resposta.planejamento.bruto}</pre>
              {!resposta.planejamento.valido && <pre>rejeitado: {resposta.planejamento.erros.join('; ')}</pre>}
            </>
          )}
          <h3>QuerySpec</h3>
          <pre>{JSON.stringify(resposta.spec, null, 2)}</pre>
          {resposta.consultas.map((c) => (
            <div key={c.rotulo}>
              <h3>
                SQL · {c.rotulo} · {c.doCache ? 'do cache' : `${formatar(c.ms, 'dec1')} ms`} · {c.linhas} {c.linhas === 1 ? 'linha' : 'linhas'}
              </h3>
              <pre>{c.sql}</pre>
              <pre>parâmetros: {c.params.length ? JSON.stringify(c.params) : 'nenhum'}</pre>
            </div>
          ))}
          {resposta.fatos.length > 0 && (
            <>
              <h3>Fatos usados no texto</h3>
              <pre>{resposta.fatos.map((f) => `${f.id}: ${f.rotulo} = ${f.valor_formatado}`).join('\n')}</pre>
            </>
          )}
          {resposta.narracao.modelo && (
            <>
              <h3>
                Texto · {resposta.narracao.origem === 'ia' ? `escrito pela IA (${resposta.narracao.versaoPrompt ?? ''}, ${duracao(resposta.narracao.ms ?? 0)}), valores preenchidos pelo app` : 'template (o da IA foi rejeitado pelo validador)'}
              </h3>
              {resposta.narracao.rejeitada && <pre>{resposta.narracao.rejeitada.join('\n')}</pre>}
              {resposta.narracao.bruto && <pre>{resposta.narracao.bruto}</pre>}
            </>
          )}
        </div>
      </details>

      {tipo === 'dados' && (
        <div className="resposta-acoes">
          {fixadoId ? (
            <button type="button" onClick={() => desafixar(fixadoId)}>Desafixar</button>
          ) : (
            <button type="button" onClick={() => { fixar({ id: resposta.id, titulo: texto.titulo, spec: resposta.spec }); avisar('Fixado na Visão Geral'); }}>
              📌 Fixar
            </button>
          )}
          <button type="button" onClick={exportarPng} disabled={!sel?.opcoes}>Exportar PNG</button>
          <button type="button" onClick={() => void copiar()}>Copiar texto</button>
          <button type="button" aria-pressed={voto === 'bom'} aria-label="Resposta boa" onClick={() => votar('bom')}>👍</button>
          <button type="button" aria-pressed={voto === 'ruim'} aria-label="Resposta ruim" onClick={() => votar('ruim')}>👎</button>
          <span className="aviso" role="status">{aviso}</span>
        </div>
      )}
    </article>
  );
}
