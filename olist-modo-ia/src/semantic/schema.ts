/**
 * Formato da camada semântica (semantic.json): a fonte única de verdade sobre
 * métricas, dimensões e sinônimos. Trocar de dataset = dados novos + um novo
 * semantic.json (o do Modo Universal será gerado automaticamente na Fase 5).
 *
 * Os trechos `sql` são configuração confiável (escrita por nós ou gerada a partir
 * de nomes de coluna validados). Valores vindos do usuário ou da IA NUNCA entram
 * no texto do SQL: viram parâmetros no compilador.
 */
import { z } from '../zod';

/** Ids viram nomes de coluna no SQL, então só letras minúsculas, dígitos e _. */
export const identificador = z.string().regex(/^[a-z][a-z0-9_]*$/, 'use só a-z, 0-9 e _');

export const formato = z.enum(['brl', 'int', 'dec1', 'dec2', 'pct', 'dias']);
export type Formato = z.infer<typeof formato>;

export const GRAOS_TEMPO = ['dia', 'semana', 'mes', 'trimestre', 'ano'] as const;
export const grao = z.enum(GRAOS_TEMPO);
export type GraoTempo = z.infer<typeof grao>;

const metrica = z.object({
  label: z.string().min(1),
  sql: z.string().min(1),
  format: formato,
  /** item: agrega as linhas do fato; order: agrega um registro por pedido (P7). */
  grain: z.enum(['item', 'order']).default('item'),
  /** Soma/contagem: sem linhas, o valor é 0 (e não "sem dado"). Usado para completar séries. */
  empty_is_zero: z.boolean().default(false),
  polarity: z.enum(['higher_is_better', 'lower_is_better', 'neutral']).default('neutral'),
  synonyms: z.array(z.string()).default([]),
  description: z.string().min(1),
});

const comum = {
  label: z.string().min(1),
  synonyms: z.array(z.string()).default([]),
  description: z.string().optional(),
};

const dimensaoCategoria = z
  .object({
    type: z.literal('categoria'),
    ...comum,
    column: identificador.optional(),
    sql: z.string().min(1).optional(),
    /** Ordem fixa de exibição (ex.: No Prazo, Atrasado, Não Entregue). */
    order: z.array(z.string()).optional(),
    /** Valor canônico -> apelidos ("SP" -> "são paulo", "sampa"). */
    value_aliases: z.record(z.string(), z.array(z.string())).optional(),
  })
  .refine((d) => (d.column === undefined) !== (d.sql === undefined), 'informe column OU sql');

const dimensaoTempo = z.object({
  type: z.literal('tempo'),
  ...comum,
  column: identificador,
  grains: z.array(grao).min(1),
  default_grain: grao,
});

const dimensaoFaixa = z.object({
  type: z.literal('faixa'),
  ...comum,
  column: identificador,
  /** Faixas em ordem crescente; `max` exclusivo; a última tem max null. */
  buckets: z
    .array(z.object({ label: z.string().min(1), max: z.number().nullable() }))
    .min(2)
    .refine((b) => b.at(-1)?.max === null && b.slice(0, -1).every((x) => x.max !== null), 'só a última faixa tem max null')
    .refine(
      (b) => b.slice(0, -1).every((x, i) => i === 0 || (x.max ?? 0) > (b[i - 1]?.max ?? 0)),
      'limites em ordem crescente',
    ),
});

export const dimensao = z.discriminatedUnion('type', [dimensaoCategoria, dimensaoTempo, dimensaoFaixa]);
export type Dimensao = z.infer<typeof dimensao>;
export type DimensaoCategoria = z.infer<typeof dimensaoCategoria>;
export type DimensaoFaixa = z.infer<typeof dimensaoFaixa>;
export type Metrica = z.infer<typeof metrica>;

export const semanticaSchema = z
  .object({
    version: z.literal(1),
    dataset: z.object({
      id: identificador,
      name: z.string().min(1),
      description: z.string().min(1),
      table: identificador,
      order_key: identificador,
      order_columns: z.array(identificador),
      time_column: identificador,
      source: z.string().optional(),
      license: z.string().optional(),
    }),
    metrics: z.record(identificador, metrica),
    dimensions: z.record(identificador, dimensao),
    defaults: z.object({
      periodo: z.object({ de: z.iso.date(), ate: z.iso.date() }),
      limit: z.number().int().min(1).max(50),
    }),
    out_of_scope_hints: z.record(z.string(), z.string()).default({}),
  })
  .refine((s) => Object.keys(s.metrics).length > 0, 'pelo menos uma métrica')
  .refine(
    (s) => Object.values(s.dimensions).filter((d) => d.type === 'tempo').length <= 1,
    'no máximo uma dimensão de tempo',
  );

export type Semantica = z.infer<typeof semanticaSchema>;

export function carregarSemantica(bruto: unknown): Semantica {
  return semanticaSchema.parse(bruto);
}
