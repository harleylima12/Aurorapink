import { iniciarMotor, type Motor } from '../data/duckdb';

let promessa: Promise<Motor> | null = null;

/** Um motor só por página. Chamado já no main.tsx, antes do React, para os downloads começarem cedo. */
export function obterMotor(): Promise<Motor> {
  promessa ??= iniciarMotor();
  return promessa;
}
