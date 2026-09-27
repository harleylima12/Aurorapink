/**
 * Roda a suíte evals/perguntas.json pelo MESMO caminho do Modo IA (`responder`): roteamento, SQL no DuckDB,
 * insights e texto. Serve à página /avaliacao (navegador) e ao teste unitário (Node).
 *
 * - "Camada 0": sem IA. "Camada 0 + 1": o que a Camada 0 não resolve vai para a IA local (real no PC, motor
 *   falso nos testes), e o texto de cada resposta passa pelo narrador da IA + validador.
 * - Latência: ponta a ponta (da pergunta à resposta pronta), p50 e p95.
 */
import { narrarComMotor, responder, type ContextoResposta } from '../modo-ia/responder';
import type { QuerySpec } from '../query/spec';
import { diferencas, type PerguntaAvaliacao } from './comparar';

export type ModoAvaliacao = 'camada0' | 'camada0+1';

export interface ResultadoPergunta {
  id: string;
  categoria: string;
  lote?: string;
  pergunta: string;
  ok: boolean;
  erros: string[];
  /** Quem montou o spec. */
  modo: 'rapido' | 'ia';
  tipo: string;
  ms: number;
  /** Só com IA: o texto da IA passou no validador ou ficou o template. */
  narracao?: 'ia' | 'template-rejeitada' | 'template';
  spec: QuerySpec;
}

export interface Relatorio {
  modo: ModoAvaliacao;
  modelo?: string;
  geradoEm: string;
  geral: { acertos: number; total: number };
  faceisEMedias: { acertos: number; total: number };
  foraRecusadas: { acertos: number; total: number };
  loteFase7: { acertos: number; total: number };
  porCategoria: Record<string, { acertos: number; total: number }>;
  /** Respostas que foram para a IA (Camada 1). */
  viaIA: number;
  /** Narrador: textos da IA recusados pelo validador ÷ textos tentados. */
  fallbackNarrador?: { recusados: number; tentados: number };
  latenciaMs: { p50: number; p95: number; max: number };
  metas: { nome: string; alvo: string; valor: string; ok: boolean }[];
  resultados: ResultadoPergunta[];
}

export function percentil(valores: readonly number[], p: number): number {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * p))]!;
}

const pct = (a: number, t: number) => (t ? `${((a / t) * 100).toFixed(1).replace('.', ',')}%` : '—');

export function resumir(resultados: readonly ResultadoPergunta[], modo: ModoAvaliacao, modelo?: string): Relatorio {
  const conta = (lista: readonly ResultadoPergunta[]) => ({ acertos: lista.filter((r) => r.ok).length, total: lista.length });
  const porCategoria: Relatorio['porCategoria'] = {};
  for (const r of resultados) {
    const c = (porCategoria[r.categoria] ??= { acertos: 0, total: 0 });
    c.total++;
    if (r.ok) c.acertos++;
  }
  const geral = conta(resultados);
  const faceisEMedias = conta(resultados.filter((r) => r.categoria === 'facil' || r.categoria === 'media'));
  const foraRecusadas = conta(resultados.filter((r) => r.categoria === 'fora'));
  const narradas = resultados.filter((r) => r.narracao && r.narracao !== 'template');
  const tempos = resultados.map((r) => r.ms);
  const latenciaMs = { p50: percentil(tempos, 0.5), p95: percentil(tempos, 0.95), max: Math.max(0, ...tempos) };
  const metas: Relatorio['metas'] = [
    { nome: 'Fáceis e médias', alvo: '≥ 90%', valor: pct(faceisEMedias.acertos, faceisEMedias.total), ok: faceisEMedias.acertos >= 0.9 * faceisEMedias.total },
    { nome: 'Geral', alvo: '≥ 75%', valor: pct(geral.acertos, geral.total), ok: geral.acertos >= 0.75 * geral.total },
    { nome: 'Fora de escopo recusadas', alvo: '100%', valor: pct(foraRecusadas.acertos, foraRecusadas.total), ok: foraRecusadas.acertos === foraRecusadas.total },
    { nome: 'Modo Rápido ponta a ponta (p95)', alvo: '< 300 ms', valor: `${Math.round(latenciaMs.p95)} ms`, ok: modo === 'camada0+1' || latenciaMs.p95 < 300 },
  ];
  return {
    modo,
    ...(modelo ? { modelo } : {}),
    geradoEm: new Date().toISOString(),
    geral,
    faceisEMedias,
    foraRecusadas,
    loteFase7: conta(resultados.filter((r) => r.lote === 'fase7')),
    porCategoria,
    viaIA: resultados.filter((r) => r.modo === 'ia').length,
    ...(modo === 'camada0+1' ? { fallbackNarrador: { recusados: narradas.filter((r) => r.narracao === 'template-rejeitada').length, tentados: narradas.length } } : {}),
    latenciaMs,
    metas,
    resultados: [...resultados],
  };
}

export async function rodarSuite(
  perguntas: readonly PerguntaAvaliacao[],
  base: ContextoResposta,
  opcoes: { ia?: ContextoResposta['ia']; aoProgresso?: (feitas: number, total: number) => void } = {},
): Promise<Relatorio> {
  const ctx: ContextoResposta = opcoes.ia ? { ...base, ia: opcoes.ia } : { ...base, ia: undefined };
  const specs = new Map<string, QuerySpec>();
  const resultados: ResultadoPergunta[] = [];
  for (const [i, p] of perguntas.entries()) {
    const anterior = p.anterior ? (specs.get(p.anterior) ?? null) : null;
    const t0 = performance.now();
    let r = await responder(p.pergunta, ctx, anterior);
    let narracao: ResultadoPergunta['narracao'];
    if (opcoes.ia) {
      r = await narrarComMotor(r, opcoes.ia.motor);
      narracao = r.narracao.origem === 'ia' ? 'ia' : r.narracao.rejeitada?.length ? 'template-rejeitada' : 'template';
    }
    const ms = performance.now() - t0;
    specs.set(p.id, r.spec);
    const erros = diferencas(r.spec, p.esperado);
    resultados.push({
      id: p.id,
      categoria: p.categoria,
      ...(p.lote ? { lote: p.lote } : {}),
      pergunta: p.pergunta,
      ok: erros.length === 0,
      erros,
      modo: r.modo,
      tipo: r.tipo,
      ms,
      ...(narracao ? { narracao } : {}),
      spec: r.spec,
    });
    opcoes.aoProgresso?.(i + 1, perguntas.length);
  }
  return resumir(resultados, opcoes.ia ? 'camada0+1' : 'camada0', opcoes.ia?.motor.id);
}

