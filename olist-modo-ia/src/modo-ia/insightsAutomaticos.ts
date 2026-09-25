/**
 * Os 3 insights que aparecem ao abrir o Modo IA (seção 11): consultas pré-definidas, sem pergunta.
 * 1. Sazonalidade e Black Friday; 2. impacto do atraso na nota; 3. concentração por estado.
 */
import { compilar } from '../query/compiler';
import type { QuerySpec } from '../query/spec';
import { fato } from '../insights/engine';
import { responderSpec, type ContextoResposta, type Resposta } from './responder';

const base = { dimensions: [], filters: [] } satisfies Pick<QuerySpec, 'dimensions' | 'filters'>;

async function valor(ctx: ContextoResposta, spec: QuerySpec, id: string): Promise<{ v: number | null; sql: string; params: (string | number)[]; ms: number }> {
  const { sql, params } = compilar(spec, ctx.semantica);
  const r = await ctx.executor.consultar(sql, params);
  const v = r.linhas[0]?.[id];
  return { v: typeof v === 'number' ? v : null, sql, params, ms: r.ms };
}

export async function insightsAutomaticos(ctx: ContextoResposta): Promise<Resposta[]> {
  // 1. Sazonalidade + Black Friday (24/11/2017) contra a média diária de 2017.
  const sazonal = await responderSpec(
    'Sazonalidade: quando a Olist mais vende',
    { ...base, intent: 'tendencia', metrics: ['faturamento'], dimensions: ['tempo'], time: { grain: 'mes' } },
    ctx,
  );
  const bf = await valor(ctx, { ...base, intent: 'kpi', metrics: ['faturamento'], time: { from: '2017-11-24', to: '2017-11-24' } }, 'faturamento');
  const ano = await valor(ctx, { ...base, intent: 'kpi', metrics: ['faturamento'], time: { from: '2017-01-01', to: '2017-12-31' } }, 'faturamento');
  if (bf.v !== null && ano.v) {
    const mediaDiaria = ano.v / 365;
    const fBf = fato('black_friday', 'total', 'Black Friday 2017 (24/11)', bf.v, 'brl', 0.95);
    const fRazao = fato('bf_vs_media', 'razao', 'média diária de 2017', bf.v / mediaDiaria, 'dec1', 0.9);
    sazonal.fatos.push(fBf, fRazao);
    sazonal.consultas.push(
      { rotulo: 'Black Friday 2017', sql: bf.sql, params: bf.params, ms: bf.ms, linhas: 1, doCache: false },
      { rotulo: 'faturamento de 2017 (média diária = total ÷ 365)', sql: ano.sql, params: ano.params, ms: ano.ms, linhas: 1, doCache: false },
    );
    sazonal.texto.bullets.splice(1, 0, `${fBf.rotulo}: ${fBf.valor_formatado}, ${fRazao.valor_formatado} vezes a ${fRazao.rotulo}.`);
    sazonal.texto.bullets = sazonal.texto.bullets.slice(0, 4);
  }
  sazonal.texto.titulo = 'Sazonalidade: novembro de 2017 foi o pico';

  // 2. Atraso x nota.
  const atraso = await responderSpec(
    'Impacto do atraso na nota',
    { ...base, intent: 'comparacao', metrics: ['nota_media'], dimensions: ['status_entrega'], filters: [{ dimension: 'status_entrega', op: 'in', values: ['No Prazo', 'Atrasado'] }] },
    ctx,
  );
  atraso.texto.titulo = 'Atraso derruba a nota dos clientes';

  // 3. Concentração por estado.
  const estados = await responderSpec(
    'Concentração por estado',
    { ...base, intent: 'ranking', metrics: ['faturamento'], dimensions: ['estado_cliente'], limit: 10, sort: { by: 'faturamento', dir: 'desc' } },
    ctx,
  );
  estados.texto.titulo = 'Vendas concentradas no Sudeste';

  return [sazonal, atraso, estados];
}

/**
 * Insights ao abrir o Modo IA sobre uma PLANILHA: os mesmos specs do dashboard automático, passando
 * pelo pipeline normal (fatos + template + validador). Nada específico da Olist.
 */
export function insightsDaPlanilha(specs: readonly { titulo: string; spec: QuerySpec }[]): (ctx: ContextoResposta) => Promise<Resposta[]> {
  return async (ctx) => {
    const lista: Resposta[] = [];
    for (const { titulo, spec } of specs.slice(0, 3)) {
      const r = await responderSpec(titulo, spec, ctx);
      if (r.tipo === 'dados') lista.push({ ...r, texto: { ...r.texto, titulo } });
    }
    return lista;
  };
}
