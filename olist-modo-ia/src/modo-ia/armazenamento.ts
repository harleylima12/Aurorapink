/**
 * O que o Modo IA guarda no navegador (localStorage, nunca sai do computador):
 * - fixados: perguntas fixadas no dashboard;
 * - avaliações 👍/👎: vão alimentar a suíte de avaliação (Fase 7).
 * O botão "Apagar dados locais" (Fase 6) limpa tudo isso.
 */
import type { QuerySpec } from '../query/spec';

export interface Fixado {
  id: string;
  titulo: string;
  spec: QuerySpec;
}

export interface Avaliacao {
  pergunta: string;
  spec: QuerySpec;
  voto: 'bom' | 'ruim';
  em: string;
}

export const CHAVES = { fixados: 'olist-modo-ia:fixados', avaliacoes: 'olist-modo-ia:avaliacoes' } as const;

function ler<T>(chave: string): T[] {
  try {
    const bruto = window.localStorage.getItem(chave);
    const dado: unknown = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(dado) ? (dado as T[]) : [];
  } catch {
    return [];
  }
}

function gravar<T>(chave: string, lista: T[]): void {
  try {
    window.localStorage.setItem(chave, JSON.stringify(lista));
    window.dispatchEvent(new CustomEvent('olist-armazenamento', { detail: chave }));
  } catch {
    // Navegação privada ou armazenamento cheio: a função continua, só não lembra.
  }
}

export const lerFixados = () => ler<Fixado>(CHAVES.fixados);
export function fixar(item: Fixado): void {
  gravar(CHAVES.fixados, [...lerFixados().filter((f) => f.id !== item.id), item].slice(-6));
}
export function desafixar(id: string): void {
  gravar(CHAVES.fixados, lerFixados().filter((f) => f.id !== id));
}

export const lerAvaliacoes = () => ler<Avaliacao>(CHAVES.avaliacoes);
export function avaliar(item: Avaliacao): void {
  gravar(CHAVES.avaliacoes, [...lerAvaliacoes(), item].slice(-200));
}
