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

test('prints do Modo IA (Fase 3)', async ({ page }) => {
  test.setTimeout(180_000);
  const pasta = path.join(RAIZ, 'docs', 'prints', 'fase3');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await abrir(page);
  await page.keyboard.press('/');
  await page.locator('.insights-automaticos .resposta').nth(2).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(pasta, '1-painel-insights-automaticos.png') });

  const perguntar = async (texto: string) => {
    const antes = await page.locator('.painel-ia-corpo > .resposta').count();
    await page.locator('#campo-pergunta').fill(texto);
    await page.locator('#campo-pergunta').press('Enter');
    await page.locator('.painel-ia-corpo > .resposta').nth(antes).waitFor();
    await page.waitForTimeout(500);
    return page.locator('.painel-ia-corpo > .resposta').last();
  };

  const ranking = await perguntar('top 5 categorias em 2018');
  await ranking.screenshot({ path: path.join(pasta, '2-ranking.png') });
  await ranking.getByText(/Como calculei/).click();
  await page.waitForTimeout(300);
  await ranking.screenshot({ path: path.join(pasta, '3-como-calculei.png') });

  const seguimento = await perguntar('e só em SP?');
  await seguimento.screenshot({ path: path.join(pasta, '4-follow-up-sp.png') });
  const porque = await perguntar('por que o faturamento caiu em dezembro de 2017?');
  await porque.screenshot({ path: path.join(pasta, '5-por-que-cascata.png') });
  const kpi = await perguntar('faturamento de 2018 vs ano anterior');
  await kpi.screenshot({ path: path.join(pasta, '6-kpi-vs-ano-anterior.png') });
  const nota = await perguntar('nota de quem recebeu atrasado vs no prazo');
  await nota.screenshot({ path: path.join(pasta, '7-atraso-vs-nota.png') });
  const fora = await perguntar('qual o lucro por categoria?');
  await fora.screenshot({ path: path.join(pasta, '8-fora-de-escopo.png') });
  const vaga = await perguntar('como estamos?');
  await vaga.screenshot({ path: path.join(pasta, '9-esclarecer-chips.png') });
  await page.screenshot({ path: path.join(pasta, '10-painel-completo.png') });

  const tendencia = await perguntar('faturamento mês a mês');
  await tendencia.getByRole('button', { name: /Fixar/ }).click();
  await page.keyboard.press('Escape');
  await page.locator('.fixados canvas').waitFor();
  await page.waitForTimeout(600);
  await page.locator('.fixados').screenshot({ path: path.join(pasta, '11-fixado-no-dashboard.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('/');
  await page.locator('.insights-automaticos .resposta').first().waitFor();
  await perguntar('onde o frete é mais caro?');
  await page.screenshot({ path: path.join(pasta, '12-celular.png') });
});
