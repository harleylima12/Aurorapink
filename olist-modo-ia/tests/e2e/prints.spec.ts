/** Prints do resumo da fase (docs/prints/fase2). Só roda com PRINTS=1: `PRINTS=1 npx playwright test prints`. */
import path from 'node:path';

import { test } from '@playwright/test';

import { abrir, esperarKpi, RAIZ } from './ajuda';

const PASTA = path.join(RAIZ, 'docs', 'prints', 'fase2');

test.skip(!process.env.PRINTS, 'defina PRINTS=1 para gerar os prints');

test('prints das 3 páginas, filtros, "Como calculei" e celular', async ({ page }) => {
  test.setTimeout(180_000);
  await abrir(page);
  await page.screenshot({ path: path.join(PASTA, '1-visao-geral.png'), fullPage: true });

  await page.getByRole('link', { name: /Produtos/ }).click();
  await esperarKpi(page, 'itens', 112_101, 0);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(PASTA, '2-produtos.png'), fullPage: true });

  await page.getByRole('link', { name: /Logística/ }).click();
  await esperarKpi(page, 'pct_atraso', 0.067731, 5);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(PASTA, '3-logistica.png'), fullPage: true });

  await page.getByRole('link', { name: /Visão Geral/ }).click();
  await page.getByRole('combobox', { name: 'Ano', exact: true }).selectOption('2018');
  await page.getByRole('combobox', { name: 'Estado do cliente', exact: true }).selectOption('SP');
  await esperarKpi(page, 'faturamento', 2_960_471.25);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(PASTA, '4-filtro-2018-sp.png'), fullPage: true });

  const painel = page.locator('[data-visual="faturamento-estado"]');
  await painel.getByText(/Como calculei/).click();
  await painel.scrollIntoViewIfNeeded();
  await painel.screenshot({ path: path.join(PASTA, '5-como-calculei.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/logistica');
  await esperarKpi(page, 'pct_atraso', 0.067731, 5);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(PASTA, '6-celular-logistica.png'), fullPage: true });
});
