/**
 * O que o Modo IA guarda no navegador (localStorage, nunca sai do computador):
 * - fixados: perguntas fixadas no dashboard;
 * - avaliações 👍/👎: vão alimentar a suíte de avaliação (Fase 7);
 * - falhas do narrador da IA (texto rejeitado pelo validador): também para a Fase 7;
 * - se a pessoa já ativou a IA local (para reabrir sozinha, com o modelo já em cache).
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

export interface FalhaNarrador {
  pergunta: string;
  modelo: string;
  versaoPrompt?: string;
  erros: string[];
  bruto?: string;
  em: string;
}

export const CHAVES = {
  fixados: 'olist-modo-ia:fixados',
  avaliacoes: 'olist-modo-ia:avaliacoes',
  falhasNarrador: 'olist-modo-ia:falhas-narrador',
  iaAtivada: 'olist-modo-ia:ia-ativada',
} as const;

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

export const lerFalhasNarrador = () => ler<FalhaNarrador>(CHAVES.falhasNarrador);
export function registrarFalhaNarrador(item: FalhaNarrador): void {
  gravar(CHAVES.falhasNarrador, [...lerFalhasNarrador(), { ...item, bruto: item.bruto?.slice(0, 1000) }].slice(-50));
}

export function iaFoiAtivada(): boolean {
  try {
    return window.localStorage.getItem(CHAVES.iaAtivada) === '1';
  } catch {
    return false;
  }
}
export function lembrarIaAtivada(sim: boolean): void {
  try {
    if (sim) window.localStorage.setItem(CHAVES.iaAtivada, '1');
    else window.localStorage.removeItem(CHAVES.iaAtivada);
  } catch {
    // sem armazenamento: só não lembra
  }
}
