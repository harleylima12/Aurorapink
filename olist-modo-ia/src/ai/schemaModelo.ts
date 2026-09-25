/**
 * JSON Schema que restringe a saída do modelo (XGrammar, dentro do WebLLM).
 *
 * Nasce do MESMO schema Zod que valida o QuerySpec (src/query/spec.ts), mas é simplificado:
 * o XGrammar é o risco nº 2 da Fase 0, então o schema fica só com enums, tipos e limites.
 * A regex gigante que o Zod gera para datas vira um padrão curto AAAA-MM-DD; "format" sai.
 * As regras que não cabem no schema (ex.: período invertido) continuam no Zod, DEPOIS do modelo.
 */
import { criarSchemaQuerySpec } from '../query/spec';
import type { Semantica } from '../semantic/schema';
import { z } from '../zod';

export const CHAVES_PERMITIDAS = new Set([
  'type', 'properties', 'required', 'items', 'enum', 'anyOf', 'const',
  'minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'additionalProperties', 'pattern',
]);

const DATA = '^\\d{4}-\\d{2}-\\d{2}$';

type Json = null | boolean | number | string | Json[] | { [chave: string]: Json };

function limpar(no: Json): Json {
  if (Array.isArray(no)) return no.map(limpar);
  if (no === null || typeof no !== 'object') return no;
  const saida: { [chave: string]: Json } = {};
  const ehData = no.format === 'date';
  for (const [chave, valor] of Object.entries(no)) {
    if (!CHAVES_PERMITIDAS.has(chave)) continue;
    if (chave === 'pattern') {
      saida.pattern = ehData ? DATA : valor;
      continue;
    }
    if (chave === 'properties' && valor && typeof valor === 'object' && !Array.isArray(valor)) {
      saida.properties = Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, limpar(v)]));
      continue;
    }
    saida[chave] = limpar(valor);
  }
  if (ehData && !saida.pattern) saida.pattern = DATA;
  return saida;
}

export function schemaQuerySpecParaModelo(semantica: Semantica): Json {
  return limpar(z.toJSONSchema(criarSchemaQuerySpec(semantica), { target: 'draft-7' }) as Json);
}

export function schemaNarracao(idsFatos: readonly string[]) {
  const [primeiro, ...resto] = idsFatos.length ? idsFatos : ['sem_fatos'];
  return z.object({
    titulo: z.string().min(3).max(90),
    bullets: z
      .array(z.object({ texto: z.string().min(3).max(240), fatos: z.array(z.enum([primeiro ?? 'sem_fatos', ...resto])).max(4) }))
      .min(1)
      .max(4),
    hipotese: z.string().max(240).optional(),
  });
}

export function schemaNarracaoParaModelo(idsFatos: readonly string[]): Json {
  return limpar(z.toJSONSchema(schemaNarracao(idsFatos), { target: 'draft-7' }) as Json);
}

/** Palavras-chave que sobraram no schema (para o teste garantir que o XGrammar só recebe o básico). */
export function chavesUsadas(no: Json, acumulado = new Set<string>()): Set<string> {
  if (Array.isArray(no)) no.forEach((n) => chavesUsadas(n, acumulado));
  else if (no && typeof no === 'object') {
    for (const [k, v] of Object.entries(no)) {
      if (k !== 'properties') acumulado.add(k);
      if (k === 'properties' && v && typeof v === 'object' && !Array.isArray(v)) Object.values(v).forEach((x) => chavesUsadas(x, acumulado));
      else chavesUsadas(v, acumulado);
    }
  }
  return acumulado;
}
