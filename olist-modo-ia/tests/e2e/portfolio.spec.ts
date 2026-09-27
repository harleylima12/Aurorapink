/**
 * Fase 8: imagem de compartilhamento (public/og-image.png, 1200×630) e quadros do GIF de demonstração
 * (docs/gif/quadros/*.png; o GIF é montado por scripts/montar_gif.py). Só roda com PRINTS=1.
 * Tudo sai do app de verdade (build de produção), sem montagem manual.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { esperarDashboard, RAIZ } from './ajuda';

test.skip(!process.env.PRINTS, 'só com PRINTS=1');

const QUADROS = path.join(RAIZ, 'docs', 'gif', 'quadros');

test('og-image e quadros do GIF', async ({ browser }) => {
  test.setTimeout(240_000);
  mkdirSync(QUADROS, { recursive: true });
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await contexto.newPage();
  let n = 0;
  const quadro = async (p: Page, nome: string) => {
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(QUADROS, `${String(++n).padStart(2, '0')}-${nome}.png`) });
  };

  // 1) Dashboard da Olist e o Modo IA respondendo sem IA (Camada 0).
  await page.goto('/');
  await esperarDashboard(page);
  await page.waitForTimeout(1200);
  await quadro(page, 'dashboard');
  const capa = await page.screenshot();
  await page.getByRole('button', { name: /Modo IA/ }).click();
  await page.locator('#campo-pergunta').pressSequentially('top 5 categorias em 2018', { delay: 25 });
  await quadro(page, 'pergunta');
  await page.locator('#campo-pergunta').press('Enter');
  await expect(page.locator('.painel-ia-corpo > .resposta').last()).toHaveAttribute('data-tipo', 'dados', { timeout: 30_000 });
  await quadro(page, 'resposta');
  await page.locator('#campo-pergunta').fill('e só em SP?');
  await page.locator('#campo-pergunta').press('Enter');
  await expect(page.locator('.painel-ia-corpo > .resposta')).toHaveCount(2, { timeout: 30_000 });
  await quadro(page, 'follow-up');
  await page.locator('.painel-ia-corpo > .resposta').last().getByText(/Como calculei/).click();
  await quadro(page, 'como-calculei');

  // 2) Modo Universal: exemplo de vendas -> tema -> dashboard por tema.
  await page.goto('/planilha');
  await expect(page.getByRole('heading', { name: 'Arraste sua planilha aqui' })).toBeVisible({ timeout: 60_000 });
  await quadro(page, 'planilha-entrada');
  await page.locator('[data-exemplo="vendas"]').click();
  await expect(page.locator('.kpi-previa').first()).toBeVisible({ timeout: 30_000 });
  await quadro(page, 'entendi-assim');
  await page.locator('[data-pergunta="objetivo"]').getByRole('button', { name: 'Achar os produtos campeões' }).click();
  await quadro(page, 'objetivo');
  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  await expect(page.getByTestId('tema-dashboard')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await quadro(page, 'dashboard-tema');

  // 3) Avaliação no navegador.
  await page.goto('/avaliacao');
  await page.getByRole('button', { name: 'Rodar com a Camada 0 (sem IA)' }).click();
  await expect(page.locator('.avaliacao-resultado')).toBeVisible({ timeout: 120_000 });
  await quadro(page, 'avaliacao');

  // og-image: página em branco (sem CSP), com o print real do dashboard ao lado do texto.
  const card = await contexto.newPage();
  await card.setViewportSize({ width: 1200, height: 630 });
  await card.setContent(`<!doctype html><html lang="pt-BR"><body style="margin:0">
    <div style="width:1200px;height:630px;box-sizing:border-box;padding:56px;display:flex;gap:40px;align-items:center;
      background:radial-gradient(circle at 15% 20%,#16233f 0,#0b1120 60%);color:#f1f5f9;font-family:system-ui,'Segoe UI',Roboto,Arial,sans-serif">
      <div style="flex:0 0 440px">
        <div style="font-size:20px;color:#22d3ee;font-weight:600;letter-spacing:.02em">olist-modo-ia</div>
        <h1 style="font-size:52px;line-height:1.08;margin:14px 0 18px">Dashboard com IA <span style="background:linear-gradient(90deg,#22d3ee,#8b5cf6);-webkit-background-clip:text;color:transparent">100% local</span></h1>
        <p style="font-size:24px;line-height:1.35;color:#cbd5e1;margin:0 0 26px">Pergunte em português. Nenhum dado sai do seu computador: DuckDB e IA rodam no navegador.</p>
        <p style="font-size:19px;color:#94a3b8;margin:0">Olist · qualquer planilha CSV/Excel · 0 requisições externas</p>
      </div>
      <img src="data:image/png;base64,${capa.toString('base64')}" style="width:640px;border-radius:14px;border:1px solid #1e2a45;box-shadow:0 20px 60px rgba(0,0,0,.55)" alt="">
    </div></body></html>`);
  await card.screenshot({ path: path.join(RAIZ, 'public', 'og-image.png') });
  await contexto.close();
});
