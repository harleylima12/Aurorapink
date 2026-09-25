/**
 * Privacidade e segurança, versão da Fase 2 (a Fase 6 amplia: service worker, contador, modos demo/local).
 * - CSP de produção no cabeçalho da página E do worker do DuckDB;
 * - nenhuma violação de CSP nas 3 páginas;
 * - auditoria de rede: nenhuma requisição sai do próprio site.
 */
import { expect, test } from '@playwright/test';

import { abrir, esperarDashboard, violacoesCsp } from './ajuda';

test('CSP no cabeçalho da página e do worker do DuckDB', async ({ page, request }) => {
  const workers: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('duckdb-browser-') && r.url().endsWith('.js')) workers.push(r.url());
  });
  const resposta = await page.goto('/');
  const cabecalhos = resposta?.headers() ?? {};
  expect(cabecalhos['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(cabecalhos['content-security-policy']).toContain("connect-src 'self'");
  expect(cabecalhos['referrer-policy']).toBe('no-referrer');
  await esperarDashboard(page);

  expect(workers.length).toBeGreaterThan(0);
  for (const url of workers) {
    const doWorker = await request.get(url);
    expect(doWorker.headers()['content-security-policy'], url).toContain("default-src 'self'");
  }
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
});

test('nenhuma violação de CSP nas 3 páginas', async ({ page }) => {
  await abrir(page);
  for (const nome of [/Produtos/, /Logística/, /Visão Geral/]) {
    await page.getByRole('link', { name: nome }).click();
    await page.waitForTimeout(500);
  }
  await page.locator('[data-visual]').first().getByText(/Como calculei/).click();
  expect(await violacoesCsp(page)).toEqual([]);
});

test('auditoria de rede: só o próprio site', async ({ page, context, baseURL }) => {
  const origens = new Set<string>();
  const urls: string[] = [];
  context.on('request', (r) => {
    urls.push(r.url());
    origens.add(new URL(r.url()).origin);
  });
  await abrir(page);
  for (const nome of [/Produtos/, /Logística/]) {
    await page.getByRole('link', { name: nome }).click();
    await page.waitForTimeout(500);
  }
  await page.getByRole('combobox', { name: 'Ano', exact: true }).selectOption('2018');
  await page.waitForTimeout(500);

  expect([...origens]).toEqual([new URL(baseURL ?? '').origin]);
  // O WASM do DuckDB e os dados vieram do próprio site; nada de extensions.duckdb.org nem CDN.
  expect(urls.some((u) => u.endsWith('.wasm'))).toBe(true);
  expect(urls.some((u) => u.includes('/data/'))).toBe(true);
});
