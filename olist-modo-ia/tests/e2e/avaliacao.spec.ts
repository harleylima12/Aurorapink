/**
 * Fase 7: página /avaliacao no build de produção. Roda a suíte inteira no navegador (Camada 0 e Camada 0 + IA
 * com o motor falso), confere metas, latência e o JSON exportado. Com PRINTS=1, grava docs/prints/fase7.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { RAIZ, violacoesCsp, vigiarCsp } from './ajuda';

const PASTA = path.join(RAIZ, 'docs', 'prints', 'fase7');
const prints = Boolean(process.env.PRINTS);
if (prints) mkdirSync(PASTA, { recursive: true });

test('suíte no navegador: Camada 0 com todas as metas, exporta JSON; depois com a IA (motor falso)', async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const externas: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(baseURL ?? '') && !/^(data|blob):/.test(r.url())) externas.push(r.url());
  });
  await vigiarCsp(page);
  await page.goto('/avaliacao?motor=falso');
  await expect(page.getByRole('heading', { name: 'Avaliação', level: 1 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('avaliacao-perfil')).toContainText('88/88');
  await expect(page.getByTestId('avaliacao-temas')).toContainText('24/25');

  await page.getByRole('button', { name: 'Rodar com a Camada 0 (sem IA)' }).click();
  const c0 = page.locator('.avaliacao-resultado[data-modo="camada0"]');
  await expect(c0).toBeVisible({ timeout: 120_000 });
  await expect(c0.getByTestId('avaliacao-geral')).toContainText('102 de 102');
  await expect(c0.locator('tr[data-meta-ok="false"]')).toHaveCount(0);
  await expect(c0.locator('tr[data-categoria="fora"]')).toContainText('11/11');
  if (prints) await page.screenshot({ path: path.join(PASTA, '1-avaliacao-camada0.png'), fullPage: true });

  const [download] = await Promise.all([page.waitForEvent('download'), c0.getByRole('button', { name: 'Exportar JSON' }).click()]);
  const json = JSON.parse(readFileSync((await download.path())!, 'utf8')) as { geral: { acertos: number; total: number }; resultados: unknown[]; latenciaMs: { p95: number } };
  expect(json.geral).toEqual({ acertos: 102, total: 102 });
  expect(json.resultados).toHaveLength(102);
  expect(json.latenciaMs.p95).toBeLessThan(300);

  await page.getByRole('button', { name: /Ativar a IA local/ }).click();
  await page.getByRole('button', { name: /Rodar com Camada 0 \+ IA local/ }).click({ timeout: 30_000 });
  const c1 = page.locator('.avaliacao-resultado[data-modo="camada0+1"]');
  await expect(c1).toBeVisible({ timeout: 180_000 });
  await expect(c1).toContainText('motor-falso');
  await expect(c1).toContainText('Texto da IA recusado');
  if (prints) await page.screenshot({ path: path.join(PASTA, '2-avaliacao-com-ia-motor-falso.png'), fullPage: true });

  expect(await violacoesCsp(page)).toEqual([]);
  expect(externas).toEqual([]);
});
