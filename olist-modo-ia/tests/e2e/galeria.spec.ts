/**
 * Fase 5C: galeria de temas (um print por tema, para o README). Só com PRINTS=1.
 * Cada exemplo abre com um objetivo que põe o gráfico próprio do tema em destaque.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { RAIZ } from './ajuda';

test.skip(!process.env.PRINTS, 'só com PRINTS=1');

const PASTA = path.join(RAIZ, 'docs', 'prints', 'fase5c');
/** O exemplo de estoque é de MOVIMENTOS (sem estoque atual/mínimo): a galeria usa a foto de estoque estoque.tsv. */
const ARQUIVO: Record<string, string> = { estoque: 'estoque.tsv', generico: 'harley/treinos_academia.csv' };

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

const OBJETIVOS: [string, string][] = [
  ['vendas', 'Achar os produtos campeões'],
  ['financeiro', 'Controlar o caixa'],
  ['rh', 'Analisar salários'],
  ['estoque', 'Evitar falta de estoque'],
  ['marketing', 'Ver o retorno do investimento'],
  ['atendimento', 'Entender o volume de chamados'],
  ['educacao', 'Acompanhar o desempenho'],
  ['saude', 'Entender a demanda'],
  ['generico', ''],
];

for (const [tema, objetivo] of OBJETIVOS) {
  test(`galeria: ${tema}`, async ({ page }) => {
    test.setTimeout(120_000);
    mkdirSync(PASTA, { recursive: true });
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/planilha');
    await expect(page.getByTestId('zona-arquivos')).toBeVisible({ timeout: 60_000 });
    if (ARQUIVO[tema]) await soltar(page, ARQUIVO[tema]);
    else await page.locator(`[data-exemplo="${tema}"]`).click();
    const cartao = page.locator('.tema-cartao');
    await expect(cartao).toHaveAttribute('data-tema', tema, { timeout: 30_000 });
    if (objetivo) await cartao.locator('[data-pergunta="objetivo"]').getByRole('button', { name: objetivo }).click();
    await page.getByRole('button', { name: 'Gerar dashboard' }).click();
    // Genérico: layout automático de antes, só com a paleta neutra (sem gráfico principal).
    if (objetivo) await expect(page.locator('.painel.hero')).toBeVisible({ timeout: 30_000 });
    else await expect(page.locator('.app-planilha[data-tema="generico"] [data-visual] canvas').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(PASTA, `tema-${tema}.png`), fullPage: true });
    expect(erros).toEqual([]);
  });
}
