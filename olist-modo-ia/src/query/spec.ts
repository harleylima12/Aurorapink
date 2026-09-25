/**
 * QuerySpec: o "pedido de consulta" em JSON (seção 8 da especificação).
 *
 * Quem escreve o spec (dashboard, Modo Rápido ou IA) nunca escreve SQL (P2).
 * Os enums de métricas e dimensões são gerados a partir do semantic.json, então
 * um spec não consegue citar uma coluna que não existe. Na Fase 4, este mesmo
 * schema vira o JSON Schema que restringe a saída do modelo.
 */
import { z } from '../zod';

import { GRAOS_TEMPO, type Semantica } from '../semantic/schema';

export const INTENCOES = [
  'kpi',
  'tendencia',
  'ranking',
  'comparacao',
  'distribuicao',
  'explicar_variacao',
  'detalhe',
  'esclarecer',
  'fora_de_escopo',
] as const;
export type Intencao = (typeof INTENCOES)[number];

export const OPERADORES = ['in', 'not_in', 'gte', 'lte', 'between'] as const;
export type Operador = (typeof OPERADORES)[number];

export const COMPARACOES = ['periodo_anterior', 'mesmo_periodo_ano_anterior', 'nenhum'] as const;
export const GRAFICOS = ['auto', 'linha', 'barra', 'coluna', 'kpi', 'tabela', 'dispersao'] as const;

export type Grao = (typeof GRAOS_TEMPO)[number];

export interface Filtro {
  dimension: string;
  op: Operador;
  values: (string | number)[];
}

export interface QuerySpec {
  intent: Intencao;
  metrics: string[];
  dimensions: string[];
  time?: {
    grain?: Grao;
    from?: string;
    to?: string;
    compare?: (typeof COMPARACOES)[number];
  };
  filters: Filtro[];
  sort?: { by: string; dir: 'asc' | 'desc' };
  limit?: number;
  chart?: (typeof GRAFICOS)[number];
  clarify?: { question: string; options: string[] };
  out_of_scope_reason?: string;
}

/** Intenções que não geram consulta (a resposta é uma pergunta ou uma recusa). */
export const SEM_CONSULTA: readonly Intencao[] = ['esclarecer', 'fora_de_escopo'];

function naoVazio(chaves: string[], nome: string): [string, ...string[]] {
  const [primeira, ...resto] = chaves;
  if (primeira === undefined) throw new Error(`semantic.json sem ${nome}`);
  return [primeira, ...resto];
}

/** Monta o schema Zod do QuerySpec para uma camada semântica. */
export function criarSchemaQuerySpec(semantica: Semantica) {
  const metrica = z.enum(naoVazio(Object.keys(semantica.metrics), 'métricas'));
  const dimensao = z.enum(naoVazio(Object.keys(semantica.dimensions), 'dimensões'));
  const data = z.iso.date();

  return z
    .object({
      intent: z.enum(INTENCOES),
      metrics: z.array(metrica).max(3),
      dimensions: z.array(dimensao).max(2),
      time: z
        .object({
          grain: z.enum(GRAOS_TEMPO).optional(),
          from: data.optional(),
          to: data.optional(),
          compare: z.enum(COMPARACOES).optional(),
        })
        .optional(),
      filters: z
        .array(
          z.object({
            dimension: dimensao,
            op: z.enum(OPERADORES),
            values: z.array(z.union([z.string().max(200), z.number()])).min(1).max(50),
          }),
        )
        .max(10),
      sort: z.object({ by: metrica, dir: z.enum(['asc', 'desc']) }).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      chart: z.enum(GRAFICOS).optional(),
      clarify: z.object({ question: z.string().max(300), options: z.array(z.string().max(80)).max(3) }).optional(),
      out_of_scope_reason: z.string().max(300).optional(),
    })
    .superRefine((spec, ctx) => {
      if (!SEM_CONSULTA.includes(spec.intent) && spec.metrics.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'informe de 1 a 3 métricas', path: ['metrics'] });
      }
      if (new Set(spec.dimensions).size !== spec.dimensions.length) {
        ctx.addIssue({ code: 'custom', message: 'dimensão repetida', path: ['dimensions'] });
      }
      if (spec.time?.from && spec.time.to && spec.time.from > spec.time.to) {
        ctx.addIssue({ code: 'custom', message: 'período com início depois do fim', path: ['time'] });
      }
      if (spec.intent === 'esclarecer' && !spec.clarify) {
        ctx.addIssue({ code: 'custom', message: 'esclarecer precisa de clarify', path: ['clarify'] });
      }
    });
}
