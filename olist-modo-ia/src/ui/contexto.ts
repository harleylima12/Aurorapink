import { createContext, useContext } from 'react';

import type { Motor } from '../data/duckdb';

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
}

export const Dados = createContext<ContextoDados | null>(null);

export function useDados(): ContextoDados {
  const valor = useContext(Dados);
  if (!valor) throw new Error('useDados fora do provedor');
  return valor;
}
