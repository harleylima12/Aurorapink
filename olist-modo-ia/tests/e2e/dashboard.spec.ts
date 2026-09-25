/** O dashboard no navegador de verdade (build de produção, CSP de produção). */
import { expect, test } from '@playwright/test';

import { abrir, esperarKpi, TEM_EXTENSAO, valorKpi } from './ajuda';

test('Visão Geral abre com os KPIs do Power BI', async ({ page }) => {
  await abrir(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Visão Geral' })).toBeVisible();
  expect(await valorKpi(page, 'faturamento')).toBeCloseTo(13_494_400.74, 2);
  expect(await valorKpi(page, 'pedidos')).toBe(98_199);
  expect((await valorKpi(page, 'ticket_medio')).toFixed(2)).toBe('137.42');
  expect(await valorKpi(page, 'clientes')).toBe(94_983);
  await expect(page.locator('.kpi[data-metrica="faturamento"] .kpi-valor')).toHaveText(/R\$\s13,49\smi/);
  await expect(page.locator('.kpi[data-metrica="pedidos"] .kpi-valor')).toHaveText('98.199');
  // 3 gráficos desenhados (ECharts em canvas)
  await expect(page.locator('[data-visual] canvas')).toHaveCount(3);
});

test('navega pelas 3 páginas', async ({ page }) => {
  await abrir(page);
  await page.getByRole('link', { name: /Produtos/ }).click();
  await expect(page).toHaveURL(/\/produtos$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Produtos' })).toBeVisible();
  await esperarKpi(page, 'itens', 112_101, 0);
  await esperarKpi(page, 'preco_medio', 120.377, 2);
  await expect(page.locator('[data-visual="top-categorias"] canvas')).toHaveCount(1);

  await page.getByRole('link', { name: /Logística/ }).click();
  await expect(page).toHaveURL(/\/logistica$/);
  await esperarKpi(page, 'pct_atraso', 0.067731, 5);
  await esperarKpi(page, 'pct_no_prazo', 0.932269, 5);
  await esperarKpi(page, 'prazo_medio_entrega', 12.4968, 3);
  await esperarKpi(page, 'frete_medio', 22.87, 2);
  await expect(page.locator('.kpi-alerta[data-metrica="pct_atraso"]')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/produtos$/);
});

test('filtros de ano e estado mudam os números e a URL', async ({ page }) => {
  await abrir(page);
  await page.getByRole('combobox', { name: 'Ano', exact: true }).selectOption('2017');
  await expect(page).toHaveURL(/ano=2017/);
  await esperarKpi(page, 'faturamento', 6_108_492.27);
  await esperarKpi(page, 'pedidos', 44_375, 0);

  await page.getByRole('combobox', { name: 'Ano', exact: true }).selectOption('2018');
  await page.getByRole('combobox', { name: 'Estado do cliente', exact: true }).selectOption('SP');
  await expect(page).toHaveURL(/ano=2018&uf=SP/);
  await esperarKpi(page, 'faturamento', 2_960_471.25);
  await esperarKpi(page, 'pedidos', 23_599, 0);
  await esperarKpi(page, 'clientes', 23_051, 0);

  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await esperarKpi(page, 'faturamento', 13_494_400.74);
});

test('link direto com filtros abre já filtrado', async ({ page }) => {
  await abrir(page, '/?uf=SP');
  await expect(page.getByRole('combobox', { name: 'Estado do cliente', exact: true })).toHaveValue('SP');
  await esperarKpi(page, 'faturamento', 5_163_867.22);
  await esperarKpi(page, 'pedidos', 41_125, 0);
});

test('"Como calculei" mostra o spec, o SQL parametrizado e os dados', async ({ page }) => {
  await abrir(page, '/?uf=SP');
  const painel = page.locator('[data-visual="faturamento-estado"]');
  await painel.getByText(/Como calculei/).click();
  const blocos = painel.locator('pre');
  await expect(blocos.nth(0)).toContainText('"intent": "ranking"');
  await expect(blocos.nth(1)).toContainText('WITH base AS');
  await expect(blocos.nth(1)).toContainText('"estado_cliente" IN (?)');
  await expect(blocos.nth(1)).not.toContainText("'SP'");
  await expect(blocos.nth(2)).toHaveText('["SP"]');
  await expect(painel.locator('table tbody tr')).toHaveCount(1);
});

test('rodapé diz qual fonte de dados está em uso', async ({ page }) => {
  await abrir(page);
  const selo = page.locator('.selo-fonte');
  if (TEM_EXTENSAO) {
    // No PC, depois de `npm run baixar-extensoes`: caminho final, sem fallback.
    await expect(selo).toHaveAttribute('data-fonte', 'parquet');
    await expect(selo).toContainText('Parquet (caminho final)');
  } else {
    await expect(selo).toHaveAttribute('data-fonte', 'duckdb-provisorio');
    await expect(selo).toContainText('npm run baixar-extensoes');
  }
});

test('funciona no celular (390 px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  expect(await valorKpi(page, 'faturamento')).toBeCloseTo(13_494_400.74, 2);
  const larguraPagina = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(larguraPagina).toBeLessThanOrEqual(390);
});
