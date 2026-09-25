/** Compara o spec gerado com o esperado da suíte (só os campos que o esperado traz). Função pura. */
import type { QuerySpec } from '../query/spec';

export interface Esperado {
  intent: string;
  metrics?: string[];
  dimensions?: string[];
  time?: { from?: string; to?: string; grain?: string; compare?: string };
  filters?: { dimension: string; values: (string | number)[] }[];
  limit?: number;
  sort?: { dir: 'asc' | 'desc' };
}

export interface PerguntaAvaliacao {
  id: string;
  categoria: string;
  pergunta: string;
  anterior?: string;
  esperado: Esperado;
}

const mesmoConjunto = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((x) => b.some((y) => JSON.stringify(y) === JSON.stringify(x)));

/** Lista de diferenças (vazia = acertou). */
export function diferencas(obtido: QuerySpec, esperado: Esperado): string[] {
  const erros: string[] = [];
  if (obtido.intent !== esperado.intent) erros.push(`intent ${obtido.intent} ≠ ${esperado.intent}`);
  if (esperado.intent === 'esclarecer' || esperado.intent === 'fora_de_escopo') return erros;
  if (esperado.metrics && !mesmoConjunto(obtido.metrics, esperado.metrics)) erros.push(`metrics ${obtido.metrics.join(',')} ≠ ${esperado.metrics.join(',')}`);
  if (esperado.dimensions && !mesmoConjunto(obtido.dimensions, esperado.dimensions)) {
    erros.push(`dimensions ${obtido.dimensions.join(',')} ≠ ${esperado.dimensions.join(',')}`);
  }
  for (const campo of ['from', 'to', 'grain', 'compare'] as const) {
    const e = esperado.time?.[campo];
    if (e !== undefined && obtido.time?.[campo] !== e) erros.push(`time.${campo} ${obtido.time?.[campo] ?? '∅'} ≠ ${e}`);
  }
  if (esperado.filters) {
    const obtidos = obtido.filters.map((f) => ({ dimension: f.dimension, values: [...f.values].sort() }));
    const esperados = esperado.filters.map((f) => ({ dimension: f.dimension, values: [...f.values].sort() }));
    if (!mesmoConjunto(obtidos, esperados)) erros.push(`filters ${JSON.stringify(obtidos)} ≠ ${JSON.stringify(esperados)}`);
  }
  if (esperado.limit !== undefined && obtido.limit !== esperado.limit) erros.push(`limit ${obtido.limit ?? '∅'} ≠ ${esperado.limit}`);
  if (esperado.sort && obtido.sort?.dir !== esperado.sort.dir) erros.push(`sort ${obtido.sort?.dir ?? '∅'} ≠ ${esperado.sort.dir}`);
  return erros;
}
