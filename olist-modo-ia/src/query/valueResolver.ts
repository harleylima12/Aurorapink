/**
 * Confere valores de filtro contra os valores REAIS da base (função pura).
 * "são paulo" -> "SP" (apelido), "beleza e saude" -> "Beleza e Saúde" (sem acento), "belza" -> fuzzy.
 * Valor que não existe vira sugestões (o app pergunta de volta em vez de filtrar por nada).
 */
import Fuse from 'fuse.js';

import { normalizar } from '../router/normalizar';
import type { Semantica } from '../semantic/schema';

export type Resolucao =
  | { ok: true; valor: string; como: 'exato' | 'apelido' | 'aproximado' }
  | { ok: false; sugestoes: string[] };

export function resolverValor(dimensao: string, valor: string | number, valores: Readonly<Record<string, readonly string[]>>, semantica: Semantica): Resolucao {
  const def = semantica.dimensions[dimensao];
  const reais = valores[dimensao] ?? (def?.type === 'faixa' ? def.buckets.map((b) => b.label) : []);
  const alvo = normalizar(String(valor));
  const semUf = (v: string) => normalizar(v.replace(/ \([A-Z]{2}\)$/, ''));

  const exato = reais.find((r) => normalizar(r) === alvo) ?? reais.find((r) => semUf(r) === alvo);
  if (exato) return { ok: true, valor: exato, como: 'exato' };

  if (def?.type === 'categoria') {
    for (const [canonico, apelidos] of Object.entries(def.value_aliases ?? {})) {
      if (apelidos.some((a) => normalizar(a) === alvo)) return { ok: true, valor: canonico, como: 'apelido' };
    }
  }

  const fuse = new Fuse(reais.map((r) => ({ r, n: semUf(r) })), { keys: ['n'], threshold: 0.35, includeScore: true, ignoreLocation: true });
  const achados = fuse.search(alvo);
  const [melhor, segundo] = achados;
  if (melhor && (melhor.score ?? 1) <= 0.2 && (!segundo || (segundo.score ?? 1) - (melhor.score ?? 0) > 0.1)) {
    return { ok: true, valor: melhor.item.r, como: 'aproximado' };
  }
  return { ok: false, sugestoes: achados.slice(0, 3).map((a) => a.item.r) };
}
