/**
 * Modo IA (Fase 3: Modo Rápido, sem modelo) no navegador, build de produção.
 * Mede a latência de ponta a ponta DENTRO da página: da tecla Enter até o cartão da resposta
 * ser pintado (requestAnimationFrame depois de entrar no DOM). Grava evals/resultados/latencia-modo-rapido.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { abrir, RAIZ, violacoesCsp } from './ajuda';

declare global {
  interface Window {
    __latencias?: number[];
    __t0?: number;
  }
}

async function abrirModoIA(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__latencias = [];
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement | null)?.id === 'campo-pergunta') window.__t0 = performance.now();
      },
      true,
    );
    let vistos = 0;
    new MutationObserver(() => {
      const n = document.querySelectorAll('.painel-ia-corpo > .resposta').length;
      if (n > vistos && window.__t0 !== undefined) {
        const t0 = window.__t0;
        window.__t0 = undefined;
        requestAnimationFrame(() => window.__latencias?.push(performance.now() - t0));
      }
      vistos = n;
    }).observe(document, { childList: true, subtree: true }); // documentElement ainda não existe aqui
  });
  await abrir(page);
  await page.keyboard.press('/');
  await expect(page.locator('.insights-automaticos .resposta')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('#campo-pergunta')).toBeFocused();
}

async function perguntar(page: Page, pergunta: string) {
  const antes = await page.locator('.painel-ia-corpo > .resposta').count();
  await page.locator('#campo-pergunta').fill(pergunta);
  await page.locator('#campo-pergunta').press('Enter');
  await expect(page.locator('.painel-ia-corpo > .resposta')).toHaveCount(antes + 1);
  return page.locator('.painel-ia-corpo > .resposta').last();
}

const PERGUNTAS = [
  'quanto faturamos no total?',
  'top 5 categorias em 2018',
  'e só em SP?',
  'faturamento mês a mês',
  'nota de quem recebeu atrasado vs no prazo',
  'onde o frete é mais caro?',
  'por que o faturamento caiu em dezembro de 2017?',
  'faturamento de 2018 vs ano anterior',
  'itens vendidos por faixa de preço',
  'faturamento × nota média por categoria',
  'qual o lucro por categoria?',
  'como estamos?',
];

test('insights automáticos ao abrir', async ({ page }) => {
  await abrirModoIA(page);
  const insights = page.locator('.insights-automaticos .resposta');
  await expect(insights.nth(0)).toContainText('Black Friday 2017 (24/11)');
  await expect(insights.nth(1)).toContainText('No Prazo (4,29)');
  await expect(insights.nth(1)).toContainText('Atrasado (2,27)');
  await expect(insights.nth(2)).toContainText(/SP lidera: R\$\s5\.163\.867,22 \(38,3% do total\)/);
});

test('responde no Modo Rápido abaixo de 300 ms (meta da seção 16)', async ({ page, context, baseURL }) => {
  const origens = new Set<string>();
  context.on('request', (r) => origens.add(new URL(r.url()).origin));
  await abrirModoIA(page);
  const tipos: string[] = [];
  for (const p of PERGUNTAS) {
    const cartao = await perguntar(page, p);
    tipos.push((await cartao.getAttribute('data-tipo')) ?? '');
  }
  const latencias = await page.evaluate(() => window.__latencias ?? []);
  expect(latencias).toHaveLength(PERGUNTAS.length);
  const ordenadas = [...latencias].sort((a, b) => a - b);
  const p50 = ordenadas[Math.floor(ordenadas.length / 2)] ?? 0;
  const p95 = ordenadas[Math.min(ordenadas.length - 1, Math.floor(ordenadas.length * 0.95))] ?? 0;
  mkdirSync(path.join(RAIZ, 'evals', 'resultados'), { recursive: true });
  writeFileSync(
    path.join(RAIZ, 'evals', 'resultados', 'latencia-modo-rapido.json'),
    `${JSON.stringify({ p50, p95, max: ordenadas.at(-1), porPergunta: PERGUNTAS.map((p, i) => ({ pergunta: p, ms: Math.round(latencias[i] ?? 0), tipo: tipos[i] })) }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ p50: Math.round(p50), p95: Math.round(p95), max: Math.round(ordenadas.at(-1) ?? 0) }));

  expect(tipos).toEqual([...Array(10).fill('dados'), 'fora_de_escopo', 'esclarecer']);
  expect(p95).toBeLessThan(300);
  expect(await violacoesCsp(page)).toEqual([]);
  expect([...origens]).toEqual([new URL(baseURL ?? '').origin]);
});

test('cada tipo de resposta: gráfico certo, "Como calculei" e chips', async ({ page }) => {
  await abrirModoIA(page);

  const ranking = await perguntar(page, 'top 5 categorias em 2018');
  await expect(ranking.locator('.resposta-titulo')).toHaveText('Faturamento por categoria · 2018');
  await expect(ranking.locator('canvas')).toHaveCount(1);
  await expect(ranking.locator('.resposta-bullets')).toContainText('Beleza e Saúde lidera');
  await ranking.getByText(/Como calculei/).click();
  await expect(ranking.locator('.como-corpo')).toContainText('WITH base AS');
  await expect(ranking.locator('.como-corpo')).toContainText('parâmetros: ["2018-01-01","2018-12-31"]');
  await expect(ranking.locator('.como-corpo')).toContainText('primeiro_share');

  const seguimento = await perguntar(page, 'e só em SP?');
  await expect(seguimento.locator('.resposta-titulo')).toHaveText('Faturamento por categoria · SP · 2018');

  const kpi = await perguntar(page, 'faturamento de 2018 vs ano anterior');
  await expect(kpi.locator('.resposta-kpi')).toContainText('+20,2%');

  const porque = await perguntar(page, 'por que o faturamento caiu em dezembro de 2017?');
  await expect(porque).toHaveAttribute('data-intent', 'explicar_variacao');
  await expect(porque.locator('.resposta-titulo')).toContainText('dez/2017 vs nov/2017');
  await expect(porque.locator('.resposta-bullets')).toContainText('Quem mais pesou: Cama, Mesa e Banho');

  const fora = await perguntar(page, 'qual o lucro por categoria?');
  await expect(fora).toContainText('Não há dados de custo');
  await expect(fora.locator('.como-calculei')).toContainText('0 consultas');

  const vaga = await perguntar(page, 'como estamos?');
  await vaga.getByRole('button', { name: 'Satisfação dos clientes' }).click();
  const escolhida = page.locator('.painel-ia-corpo > .resposta').last();
  await expect(escolhida.locator('.resposta-kpi')).toHaveText(/4,12/);
});

test('fixar no dashboard, votar e copiar', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await abrirModoIA(page);
  const cartao = await perguntar(page, 'onde o frete é mais caro?');
  await cartao.getByRole('button', { name: /Fixar/ }).click();
  await cartao.getByRole('button', { name: 'Resposta boa' }).click();
  await cartao.getByRole('button', { name: 'Copiar texto' }).click();
  await expect(cartao.locator('.aviso')).toHaveText('Texto copiado');
  const copiado = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiado).toContain('RR lidera');
  const guardado = await page.evaluate(() => [localStorage.getItem('olist-modo-ia:fixados'), localStorage.getItem('olist-modo-ia:avaliacoes')]);
  expect(guardado[0]).toContain('frete_medio');
  expect(guardado[1]).toContain('"voto":"bom"');

  await page.keyboard.press('Escape');
  const fixados = page.locator('.fixados');
  await expect(fixados).toContainText('Frete médio por pedido por estado do cliente');
  await expect(fixados.locator('canvas')).toHaveCount(1);
});
