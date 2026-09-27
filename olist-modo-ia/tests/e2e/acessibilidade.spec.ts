/**
 * Fase 8: acessibilidade medida com axe-core (WCAG 2.0/2.1 níveis A e AA) em todas as telas: dashboard (3 páginas),
 * Modo IA aberto, Modo Universal (entrada, "Entendi assim", dashboard por tema) e /avaliacao.
 * Falha se houver qualquer violação; a lista vai para evals/resultados/acessibilidade.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { esperarDashboard, RAIZ } from './ajuda';

interface Violacao {
  tela: string;
  id: string;
  impacto: string;
  ajuda: string;
  alvos: string[];
}

async function auditar(page: Page, tela: string, saida: Violacao[]) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  for (const v of r.violations) {
    saida.push({ tela, id: v.id, impacto: v.impact ?? '', ajuda: v.help, alvos: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) });
  }
  return r.passes.length;
}

test('WCAG 2.1 A/AA sem violações em todas as telas', async ({ page }) => {
  test.setTimeout(240_000);
  const violacoes: Violacao[] = [];
  const regrasOk: Record<string, number> = {};

  await page.goto('/');
  await esperarDashboard(page);
  await page.waitForTimeout(800);
  regrasOk['visão geral'] = await auditar(page, 'visão geral', violacoes);
  for (const [nome, caminho] of [['produtos', '/produtos'], ['logística', '/logistica']] as const) {
    await page.goto(caminho);
    await esperarDashboard(page);
    await page.waitForTimeout(800);
    regrasOk[nome] = await auditar(page, nome, violacoes);
  }
  await page.getByRole('button', { name: /Modo IA/ }).click();
  await page.locator('#campo-pergunta').fill('top 5 categorias em 2018');
  await page.locator('#campo-pergunta').press('Enter');
  await expect(page.locator('.painel-ia-corpo > .resposta').last()).toHaveAttribute('data-tipo', 'dados', { timeout: 30_000 });
  await page.waitForTimeout(600);
  regrasOk['modo IA'] = await auditar(page, 'modo IA', violacoes);

  await page.goto('/planilha');
  await expect(page.getByRole('heading', { name: 'Arraste sua planilha aqui' })).toBeVisible({ timeout: 60_000 });
  regrasOk['planilha: entrada'] = await auditar(page, 'planilha: entrada', violacoes);
  await page.locator('[data-exemplo="vendas"]').click();
  await expect(page.getByRole('heading', { name: 'Entendi assim' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.kpi-previa').first()).toBeVisible({ timeout: 30_000 });
  regrasOk['planilha: entendi assim'] = await auditar(page, 'planilha: entendi assim', violacoes);
  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  await expect(page.getByTestId('tema-dashboard')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  regrasOk['planilha: dashboard'] = await auditar(page, 'planilha: dashboard', violacoes);

  await page.goto('/avaliacao');
  await expect(page.getByRole('heading', { name: 'Avaliação', level: 1 })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Rodar com a Camada 0 (sem IA)' }).click();
  await expect(page.locator('.avaliacao-resultado')).toBeVisible({ timeout: 120_000 });
  regrasOk['avaliação'] = await auditar(page, 'avaliação', violacoes);

  const pasta = path.join(RAIZ, 'evals', 'resultados');
  mkdirSync(pasta, { recursive: true });
  writeFileSync(path.join(pasta, 'acessibilidade.json'), `${JSON.stringify({ padrao: 'WCAG 2.1 A/AA (axe-core)', regrasOkPorTela: regrasOk, violacoes }, null, 2)}\n`);
  console.log(JSON.stringify(violacoes, null, 1));
  expect(violacoes).toEqual([]);
});
