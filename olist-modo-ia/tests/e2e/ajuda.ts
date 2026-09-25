import { existsSync } from 'node:fs';
import path from 'node:path';

import { expect, type Page } from '@playwright/test';

export const RAIZ = path.resolve(import.meta.dirname, '..', '..');

/** O caminho final (Parquet) só existe depois de `npm run baixar-extensoes`. */
export const TEM_EXTENSAO = existsSync(path.join(RAIZ, 'src', 'data', 'extensoes-duckdb.gerado.json'));

declare global {
  interface Window {
    __violacoesCsp?: string[];
  }
}

/** Registra toda violação de CSP da página (a CSP bloqueia; aqui a gente conta). */
export async function vigiarCsp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__violacoesCsp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__violacoesCsp?.push(`${e.violatedDirective} ${e.blockedURI} @ ${e.sourceFile}:${e.lineNumber}`);
    });
  });
}

export async function violacoesCsp(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__violacoesCsp ?? []);
}

export async function esperarDashboard(page: Page): Promise<void> {
  await page.waitForFunction(() => performance.getEntriesByName('graficos-prontos').length > 0, null, { timeout: 60_000 });
  await expect(page.locator('.kpi .kpi-valor[data-valor]').first()).toBeVisible();
}

export async function abrir(page: Page, url = '/'): Promise<void> {
  await vigiarCsp(page);
  await page.goto(url);
  await esperarDashboard(page);
}

export async function valorKpi(page: Page, metrica: string): Promise<number> {
  const bruto = await page.locator(`.kpi[data-metrica="${metrica}"] .kpi-valor`).getAttribute('data-valor');
  return Number(bruto);
}

/** Espera o KPI chegar no valor esperado (ele atualiza sozinho quando o filtro muda). */
export async function esperarKpi(page: Page, metrica: string, esperado: number, casas = 2): Promise<void> {
  await expect.poll(() => valorKpi(page, metrica), { timeout: 30_000 }).toBeCloseTo(esperado, casas);
}
