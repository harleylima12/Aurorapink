/**
 * Fase 5C no navegador: 3 temas diferentes geram gráficos diferentes e cores diferentes, sem violação de
 * acessibilidade (axe, WCAG 2.1 A/AA) e sem rolagem lateral no celular.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { RAIZ } from './ajuda';

async function soltar(page: Page, nome: string) {
  const base64 = readFileSync(path.join(RAIZ, 'evals', 'planilhas', nome)).toString('base64');
  const dt = await page.evaluateHandle(
    ([n, b]) => {
      const d = new DataTransfer();
      d.items.add(new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], n.split('/').pop()!));
      return d;
    },
    [nome, base64] as const,
  );
  await page.getByTestId('zona-arquivos').dispatchEvent('drop', { dataTransfer: dt });
}

interface Retrato {
  destaque: string;
  formas: string[];
  hero: string | null;
  /** Cor do pixel mais "saturado" do canvas do gráfico principal (a cor das marcas, não do fundo). */
  corHero: string;
}

async function dashboard(page: Page, abrir: () => Promise<void>, objetivo: string): Promise<Retrato> {
  await page.goto('/planilha');
  await expect(page.getByTestId('zona-arquivos')).toBeVisible({ timeout: 60_000 });
  await abrir();
  await page.locator('[data-pergunta="objetivo"]').getByRole('button', { name: objetivo }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  await expect(page.locator('.painel.hero canvas, .painel.hero .medidor, .painel.hero table').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  const violacoes = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations;
  expect(violacoes.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  return page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('.app-planilha')!;
    const canvas = document.querySelector<HTMLCanvasElement>('.painel.hero canvas');
    let corHero = '';
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let melhor = -1;
      for (let i = 0; i < data.length; i += 16) {
        const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        if (sat > melhor) {
          melhor = sat;
          corHero = `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
        }
      }
    }
    return {
      destaque: getComputedStyle(app).getPropertyValue('--destaque').trim(),
      formas: [...document.querySelectorAll('[data-forma]')].map((e) => e.getAttribute('data-forma')!),
      hero: document.querySelector('.painel.hero')?.getAttribute('data-forma') ?? null,
      corHero,
    };
  });
}

test('3 temas: gráficos, cores e gráfico principal diferentes; axe sem violações', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const vendas = await dashboard(page, () => page.locator('[data-exemplo="vendas"]').click(), 'Achar os produtos campeões');
  const financeiro = await dashboard(page, () => page.locator('[data-exemplo="financeiro"]').click(), 'Controlar o caixa');
  const estoque = await dashboard(page, async () => soltar(page, 'estoque.tsv'), 'Evitar falta de estoque');

  expect([vendas.hero, financeiro.hero, estoque.hero]).toEqual(['pareto', 'cascata', 'bullet']);
  expect(new Set([vendas.destaque, financeiro.destaque, estoque.destaque]).size).toBe(3);
  expect(vendas.formas).toContain('treemap');
  expect(financeiro.formas).toEqual(expect.arrayContaining(['lado_a_lado', 'acumulado']));
  expect(estoque.formas).toContain('tabela_alerta');
  // As cores pintadas no canvas também mudam (não só a variável de CSS).
  expect(new Set([vendas.corHero, financeiro.corHero, estoque.corHero]).size).toBe(3);
  // Estoque: o KPI de itens abaixo do mínimo vira cartão de alerta.
  await expect(page.locator('.kpi[data-alerta]')).toContainText('atenção');
});

test('celular: dashboard por tema sem rolagem lateral (saldo grande não estoura)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/planilha');
  await page.locator('[data-exemplo="financeiro"]').click();
  await page.getByRole('button', { name: 'Gerar dashboard' }).click({ timeout: 30_000 });
  await expect(page.locator('.painel.hero canvas')).toBeVisible({ timeout: 30_000 });
  const larguras = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(larguras[0]).toBeLessThanOrEqual(larguras[1]!);
});

test('planilha do Harley (fictícia): projetos de sites em Latin-1 viram funil de etapas', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/planilha');
  await expect(page.getByTestId('zona-arquivos')).toBeVisible({ timeout: 60_000 });
  await soltar(page, 'harley/projetos_sites.csv');
  await expect(page.locator('.tema-cartao')).toHaveAttribute('data-tema', 'vendas', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  const funil = page.locator('[data-visual="tema-funil_status"]');
  await expect(funil).toHaveAttribute('data-forma', 'funil_etapas', { timeout: 30_000 });
  await expect(funil).toContainText('fora do funil: Cancelado');
});
