import { iniciarMotor, type Motor } from '../data/duckdb';
import { firewallPronto } from '../privacidade/firewall';

let promessa: Promise<Motor> | null = null;

/** Um motor só por página. Chamado já no main.tsx, antes do React, para os downloads começarem cedo. */
export function obterMotor(): Promise<Motor> {
  // O DuckDB (e o worker dele) só começa depois que o Service Worker "firewall" assumiu a página.
  promessa ??= firewallPronto().then(iniciarMotor);
  return promessa;
}
