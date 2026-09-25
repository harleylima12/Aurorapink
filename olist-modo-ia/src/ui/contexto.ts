import { createContext, useContext } from 'react';

import type { Motor } from '../data/duckdb';
import type { Semantica } from '../semantic/schema';

export interface Metadados {
  anos: number[];
  ufs: string[];
  /** Meses (AAAA-MM-01) com poucos pedidos ou nenhum: base incompleta. */
  mesesParciais: ReadonlySet<string>;
  ancora: string;
}

export interface ContextoDados {
  motor: Motor;
  meta: Metadados;
  /** A camada semântica em uso: a da Olist (escrita à mão) ou a de uma planilha (gerada na Fase 5). */
  semantica: Semantica;
}

export const Dados = createContext<ContextoDados | null>(null);

export function useDados(): ContextoDados {
  const valor = useContext(Dados);
  if (!valor) throw new Error('useDados fora do provedor');
  return valor;
}
