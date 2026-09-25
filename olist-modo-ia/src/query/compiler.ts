/**
 * Compilador QuerySpec -> SQL (função pura, sem efeitos colaterais).
 *
 * Regras de segurança (P2):
 * - nomes de coluna e trechos de SQL vêm SÓ da camada semântica (configuração);
 * - valores de filtro e datas viram parâmetros `?` (nunca são colados no texto);
 * - ids de métricas/dimensões passam por uma checagem de formato antes de virar
 *   nome de coluna.
 *
 * Grão (P7): métricas "order" (nota, prazo, % atraso) são calculadas sobre uma
 * subconsulta com UM registro por pedido. Com uma dimensão de item (categoria),
 * o pedido conta uma vez em cada categoria que ele tem, como no Power BI.
 */
import type { Dimensao, Formato, Metrica, Semantica } from '../semantic/schema';
import { SEM_CONSULTA, type Filtro, type Grao, type QuerySpec } from './spec';

export type Parametro = string | number;

export interface ColunaResultado {
  id: string;
  papel: 'dimensao' | 'metrica';
  label: string;
  formato?: Formato;
  tipoDimensao?: Dimensao['type'];
}

export interface SqlCompilado {
  sql: string;
  params: Parametro[];
  colunas: ColunaResultado[];
}

export class ErroCompilacao extends Error {
  override name = 'ErroCompilacao';
}

const UNIDADE_TEMPO: Record<Grao, string> = {
  dia: 'day',
  semana: 'week',
  mes: 'month',
  trimestre: 'quarter',
  ano: 'year',
};

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function nome(identificador: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(identificador)) throw new ErroCompilacao(`identificador inválido: ${identificador}`);
  return `"${identificador}"`;
}

/** Só para textos da configuração (rótulos de faixa, ordem fixa), nunca para valores do usuário. */
function textoConfig(texto: string): string {
  return `'${texto.replaceAll("'", "''")}'`;
}

function numeroConfig(valor: number): string {
  if (!Number.isFinite(valor)) throw new ErroCompilacao(`número inválido na configuração: ${valor}`);
  return String(valor);
}

function grauDoSpec(spec: QuerySpec, dimensao: Dimensao): Grao {
  if (dimensao.type !== 'tempo') throw new ErroCompilacao('grão só vale para a dimensão de tempo');
  const grain = spec.time?.grain ?? dimensao.default_grain;
  if (!dimensao.grains.includes(grain)) throw new ErroCompilacao(`grão "${grain}" não disponível`);
  return grain;
}

/** Expressão SQL de uma dimensão, no grão pedido. */
function expressaoDimensao(dimensao: Dimensao, spec: QuerySpec): string {
  switch (dimensao.type) {
    case 'categoria':
      return dimensao.column ? nome(dimensao.column) : `(${dimensao.sql ?? ''})`;
    case 'tempo':
      return `strftime(date_trunc('${UNIDADE_TEMPO[grauDoSpec(spec, dimensao)]}', ${nome(dimensao.column)}), '%Y-%m-%d')`;
    case 'faixa': {
      const coluna = nome(dimensao.column);
      const casos = dimensao.buckets
        .filter((b) => b.max !== null)
        .map((b) => `WHEN ${coluna} < ${numeroConfig(b.max ?? 0)} THEN ${textoConfig(b.label)}`);
      const ultima = dimensao.buckets.at(-1);
      return `CASE ${casos.join(' ')} ELSE ${textoConfig(ultima?.label ?? '')} END`;
    }
  }
}

function buscarDimensao(semantica: Semantica, id: string): Dimensao {
  const dimensao = semantica.dimensions[id];
  if (!dimensao) throw new ErroCompilacao(`dimensão desconhecida: ${id}`);
  return dimensao;
}

function buscarMetrica(semantica: Semantica, id: string): Metrica {
  const metrica = semantica.metrics[id];
  if (!metrica) throw new ErroCompilacao(`métrica desconhecida: ${id}`);
  return metrica;
}

function compilarFiltro(filtro: Filtro, semantica: Semantica, spec: QuerySpec, params: Parametro[]): string {
  const dimensao = buscarDimensao(semantica, filtro.dimension);
  const marcadores = (quantos: number, cast?: string) =>
    Array.from({ length: quantos }, () => (cast ? `CAST(? AS ${cast})` : '?')).join(', ');

  if (dimensao.type === 'tempo') {
    const coluna = nome(dimensao.column);
    const datas = filtro.values.map(String);
    if (!datas.every((d) => DATA_ISO.test(d))) throw new ErroCompilacao('filtro de tempo exige datas AAAA-MM-DD');
    switch (filtro.op) {
      case 'gte':
      case 'lte': {
        if (datas.length !== 1) throw new ErroCompilacao(`${filtro.op} exige 1 valor`);
        params.push(...datas);
        return `${coluna} ${filtro.op === 'gte' ? '>=' : '<='} CAST(? AS DATE)`;
      }
      case 'between': {
        if (datas.length !== 2) throw new ErroCompilacao('between exige 2 valores');
        params.push(...datas);
        return `${coluna} BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)`;
      }
      default:
        throw new ErroCompilacao(`operador ${filtro.op} não vale para tempo`);
    }
  }

  const expressao = expressaoDimensao(dimensao, spec);
  if (filtro.op !== 'in' && filtro.op !== 'not_in') {
    throw new ErroCompilacao(`operador ${filtro.op} não vale para ${filtro.dimension}`);
  }
  params.push(...filtro.values.map(String));
  return `${expressao} ${filtro.op === 'in' ? 'IN' : 'NOT IN'} (${marcadores(filtro.values.length)})`;
}

/** Ordem fixa (faixas de preço, status de entrega) vira um CASE com a posição de cada valor. */
function ordemFixa(dimensao: Dimensao): string[] | null {
  if (dimensao.type === 'faixa') return dimensao.buckets.map((b) => b.label);
  if (dimensao.type === 'categoria' && dimensao.order) return dimensao.order;
  return null;
}

function compilarOrdenacao(spec: QuerySpec, semantica: Semantica): string[] {
  const chaves: string[] = [];
  const [primeira] = spec.metrics;
  if (spec.sort) {
    if (!spec.metrics.includes(spec.sort.by)) throw new ErroCompilacao('ordenação por métrica que não está na consulta');
    chaves.push(`${nome(spec.sort.by)} ${spec.sort.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`);
  } else if (spec.intent === 'ranking' && primeira) {
    chaves.push(`${nome(primeira)} DESC NULLS LAST`);
  } else {
    for (const id of spec.dimensions) {
      const dimensao = buscarDimensao(semantica, id);
      const ordem = ordemFixa(dimensao);
      if (dimensao.type === 'tempo') chaves.push(`${nome(id)} ASC`);
      else if (ordem) {
        const casos = ordem.map((valor, i) => `WHEN ${textoConfig(valor)} THEN ${i}`).join(' ');
        chaves.push(`CASE ${nome(id)} ${casos} ELSE ${ordem.length} END`);
      }
    }
    if (chaves.length === 0 && spec.dimensions.length > 0 && primeira) chaves.push(`${nome(primeira)} DESC NULLS LAST`);
  }
  // Desempate pelas dimensões: o mesmo spec sempre devolve a mesma ordem.
  for (const id of spec.dimensions) chaves.push(`${nome(id)} ASC`);
  return chaves;
}

export function compilar(spec: QuerySpec, semantica: Semantica): SqlCompilado {
  if (SEM_CONSULTA.includes(spec.intent)) throw new ErroCompilacao(`a intenção "${spec.intent}" não gera consulta`);
  if (spec.metrics.length === 0) throw new ErroCompilacao('nenhuma métrica');
  if (new Set(spec.dimensions).size !== spec.dimensions.length) throw new ErroCompilacao('dimensão repetida');

  const metricas = spec.metrics.map((id) => ({ id, def: buscarMetrica(semantica, id) }));
  const dimensoes = spec.dimensions.map((id, i) => ({ id, def: buscarDimensao(semantica, id), alias: `d${i}` }));
  const params: Parametro[] = [];

  // 1. Filtros (tudo parametrizado).
  const onde: string[] = [];
  const colunaTempo = nome(semantica.dataset.time_column);
  for (const [limite, operador] of [
    [spec.time?.from, '>='],
    [spec.time?.to, '<='],
  ] as const) {
    if (limite === undefined) continue;
    if (!DATA_ISO.test(limite)) throw new ErroCompilacao('período exige datas AAAA-MM-DD');
    onde.push(`${colunaTempo} ${operador} CAST(? AS DATE)`);
    params.push(limite);
  }
  for (const filtro of spec.filters) onde.push(compilarFiltro(filtro, semantica, spec, params));

  // 2. Base filtrada, com as dimensões já calculadas (d0, d1).
  const colunasBase = ['*', ...dimensoes.map((d) => `${expressaoDimensao(d.def, spec)} AS ${d.alias}`)];
  const ctes = [
    `base AS (\n  SELECT ${colunasBase.join(',\n         ')}\n  FROM ${nome(semantica.dataset.table)}` +
      (onde.length ? `\n  WHERE ${onde.join('\n    AND ')}` : '') +
      '\n)',
  ];
  const aliases = dimensoes.map((d) => d.alias);
  const agrupar = aliases.length ? `\n  GROUP BY ${aliases.join(', ')}` : '';
  const agregado = (m: (typeof metricas)[number]) => `CAST((${m.def.sql}) AS DOUBLE) AS ${nome(m.id)}`;

  // 3. Métricas de item: agregam as linhas do fato.
  const deItem = metricas.filter((m) => m.def.grain === 'item');
  if (deItem.length) {
    ctes.push(`por_item AS (\n  SELECT ${[...aliases, ...deItem.map(agregado)].join(',\n         ')}\n  FROM base${agrupar}\n)`);
  }

  // 4. Métricas de pedido: um registro por pedido antes de agregar (P7).
  const dePedido = metricas.filter((m) => m.def.grain === 'order');
  if (dePedido.length) {
    const colunasPedido = [...new Set([semantica.dataset.order_key, ...semantica.dataset.order_columns])].map(nome);
    ctes.push(
      `por_pedido AS (\n  SELECT ${[...aliases, ...dePedido.map(agregado)].join(',\n         ')}\n` +
        `  FROM (SELECT DISTINCT ${[...colunasPedido, ...aliases].join(', ')} FROM base) AS pedidos${agrupar}\n)`,
    );
  }

  // 5. Junta as duas partes pelas dimensões (IS NOT DISTINCT FROM também casa valores vazios).
  let origem: string;
  if (deItem.length && dePedido.length) {
    origem = aliases.length
      ? `por_item AS i\nLEFT JOIN por_pedido AS p ON ${aliases.map((a) => `i.${a} IS NOT DISTINCT FROM p.${a}`).join(' AND ')}`
      : 'por_item AS i\nCROSS JOIN por_pedido AS p';
  } else {
    origem = deItem.length ? 'por_item AS i' : 'por_pedido AS p';
  }
  const prefixoDims = deItem.length ? 'i' : 'p';
  const selecao = [
    ...dimensoes.map((d) => `${prefixoDims}.${d.alias} AS ${nome(d.id)}`),
    ...metricas.map((m) => `${m.def.grain === 'item' ? 'i' : 'p'}.${nome(m.id)}`),
  ];

  let sql = `WITH ${ctes.join(',\n')}\nSELECT ${selecao.join(',\n       ')}\nFROM ${origem}`;
  const ordenacao = compilarOrdenacao(spec, semantica);
  if (ordenacao.length) sql += `\nORDER BY ${ordenacao.join(', ')}`;
  const limite = spec.limit ?? (spec.intent === 'ranking' ? semantica.defaults.limit : undefined);
  if (limite !== undefined) {
    if (!Number.isInteger(limite) || limite < 1 || limite > 50) throw new ErroCompilacao('limit deve ser de 1 a 50');
    sql += `\nLIMIT ${limite}`;
  }

  return {
    sql,
    params,
    colunas: [
      ...dimensoes.map((d): ColunaResultado => ({ id: d.id, papel: 'dimensao', label: d.def.label, tipoDimensao: d.def.type })),
      ...metricas.map((m): ColunaResultado => ({ id: m.id, papel: 'metrica', label: m.def.label, formato: m.def.format })),
    ],
  };
}
