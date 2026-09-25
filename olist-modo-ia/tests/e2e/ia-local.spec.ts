/**
 * IA local (Fase 4) no navegador, com o MOTOR FALSO no lugar do modelo (a nuvem não tem GPU).
 * Testa o caminho inteiro: botão "Ativar IA local" -> barra de progresso -> "IA pronta" ->
 * Camada 0 resolve o fácil / Camada 1 planeja o difícil -> DuckDB calcula -> narrador + validador.
 * Qualidade e velocidade do modelo de verdade: roteiro no CLAUDE.md (PC do Harley).
 * Com PRINTS=1, grava docs/prints/fase4.
 */
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { abrir, esperarDashboard, RAIZ, violacoesCsp } from './ajuda';

const PASTA = path.join(RAIZ, 'docs', 'prints', 'fase4');
const prints = Boolean(process.env.PRINTS);

async function abrirPainel(page: Page, url: string) {
  await abrir(page, url);
  await page.keyboard.press('/');
  await expect(page.locator('.insights-automaticos .resposta')).toHaveCount(3, { timeout: 30_000 });
}

async function perguntar(page: Page, pergunta: string) {
  const cartoes = page.locator('.painel-ia-corpo > .resposta');
  const antes = await cartoes.count();
  await page.locator('#campo-pergunta').fill(pergunta);
  await page.locator('#campo-pergunta').press('Enter');
  await expect(cartoes).toHaveCount(antes + 1);
  const cartao = cartoes.last();
  await expect(cartao.locator('.narrando-aviso')).toHaveCount(0);
  return cartao;
}

async function ativarFalso(page: Page) {
  await page.getByRole('button', { name: 'Ativar IA local' }).click();
  await expect(page.locator('.status-ia[data-status="baixando"]')).toBeVisible();
  if (prints) await page.locator('.painel-ia').screenshot({ path: path.join(PASTA, '2-baixando.png') });
  await expect(page.locator('.status-ia[data-status="ia"]')).toContainText('IA pronta · 100% local');
}

test('sem clicar, nenhum byte do WebLLM é baixado', async ({ page }) => {
  const arquivos: string[] = [];
  page.on('request', (r) => arquivos.push(new URL(r.url()).pathname));
  await abrirPainel(page, '/');
  // Chromium headless: com ou sem WebGPU, o painel diz o que dá para fazer.
  await expect(page.locator('.painel-ia-topo')).toContainText(/Ativar IA local|não tem WebGPU/);
  if (prints) await page.locator('.painel-ia').screenshot({ path: path.join(PASTA, '1-antes-de-ativar.png') });
  const resposta = await perguntar(page, 'faturamento mês a mês');
  await expect(resposta).toHaveAttribute('data-modo', 'rapido');
  expect(arquivos.filter((a) => /engine\.worker|motorWebLLM|\/lib-|planner|narrator|motorFalso/.test(a))).toEqual([]);
});

test('Camada 0 resolve o fácil; a IA planeja o difícil; o DuckDB calcula', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const externas: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(baseURL ?? '') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) externas.push(r.url());
  });
  await abrirPainel(page, '/?motor=falso');
  await ativarFalso(page);

  // Fácil: a Camada 0 resolve, sem modelo. O texto é reescrito pela IA (passou no validador).
  const facil = await perguntar(page, 'top 5 categorias em 2018');
  await expect(facil).toHaveAttribute('data-modo', 'rapido');
  await expect(facil).toHaveAttribute('data-texto', 'ia');
  await expect(facil.locator('.resposta-bullets')).toContainText('Destaque para');
  await expect(facil.locator('.resposta-selo')).toContainText('Modo Rápido');
  await expect(facil.locator('.resposta-selo')).toContainText('texto: IA');

  // Difícil (a Camada 0 corrigiria "retrasado" para "Atrasado"): vai para a Camada 1.
  const dificil = await perguntar(page, 'quais produtos de casa deram mais dinheiro no ano retrasado?');
  await expect(dificil).toHaveAttribute('data-modo', 'ia');
  await expect(dificil.locator('.resposta-selo .selo-ia')).toHaveText('IA');
  await dificil.getByText(/Como calculei/).click();
  await expect(dificil.locator('.como-calculei')).toContainText('Entendi assim (Camada 1, IA local)');
  await expect(dificil.locator('.como-calculei')).toContainText('Saída crua do modelo · motor-falso · planejador-v1');
  await expect(dificil.locator('.como-calculei')).toContainText('"from": "2017-01-01"');
  await expect(dificil.locator('.como-calculei')).toContainText('parâmetros: ["2017-01-01","2017-12-31"]');
  if (prints) {
    await dificil.scrollIntoViewIfNeeded();
    await page.locator('.painel-ia').screenshot({ path: path.join(PASTA, '3-camada1-como-calculei.png') });
  }

  // Valor normalizado pela base ("são paulo" -> SP) e follow-up com o spec anterior.
  const sp = await perguntar(page, 'a turma paulista tá comprando muito?');
  await expect(sp).toHaveAttribute('data-modo', 'ia');
  await sp.getByText(/Como calculei/).click();
  await expect(sp.locator('.como-calculei')).toContainText('ajuste: "são paulo" → "SP" (apelido)');
  const rj = await perguntar(page, 'e a galera carioca?');
  await expect(rj).toHaveAttribute('data-modo', 'ia');
  await rj.getByText(/Como calculei/).click();
  await expect(rj.locator('.como-calculei')).toContainText('"RJ"');

  // Fora de escopo e esclarecimento vindos da IA.
  const fora = await perguntar(page, 'quanto sobra pra gente depois de pagar tudo?');
  await expect(fora).toHaveAttribute('data-tipo', 'fora_de_escopo');
  await expect(fora).toContainText('não dá para calcular o que sobra');
  const vago = await perguntar(page, 'me fala algo sobre isso aí');
  await expect(vago).toHaveAttribute('data-tipo', 'esclarecer');
  await expect(vago.locator('.chips .chip')).toHaveCount(3);
  if (prints) await page.locator('.painel-ia').screenshot({ path: path.join(PASTA, '4-fora-de-escopo-e-esclarecer.png') });

  expect(await violacoesCsp(page)).toEqual([]);
  expect(externas).toEqual([]);
});

test('texto da IA com número inventado é rejeitado: fica o template', async ({ page }) => {
  await abrirPainel(page, '/?motor=falso&modo=narrador-com-numero');
  await ativarFalso(page);
  const r = await perguntar(page, 'top 5 categorias em 2018');
  await expect(r).toHaveAttribute('data-texto', 'template');
  await expect(r.locator('.resposta-bullets')).not.toContainText('15%');
  await r.getByText(/Como calculei/).click();
  await expect(r.locator('.como-calculei')).toContainText('dígito fora de placeholder');
  const falhas = await page.evaluate(() => JSON.parse(localStorage.getItem('olist-modo-ia:falhas-narrador') ?? '[]') as { erros: string[] }[]);
  expect(falhas).toHaveLength(1);
  expect(falhas[0]?.erros.join(' ')).toMatch(/dígito/);
  if (prints) {
    await r.locator('.como-calculei').scrollIntoViewIfNeeded();
    await page.locator('.painel-ia').screenshot({ path: path.join(PASTA, '5-narrador-rejeitado.png') });
  }
});

test('modelo que devolve JSON quebrado vira pergunta de volta, nunca SQL', async ({ page }) => {
  await abrirPainel(page, '/?motor=falso&modo=json-quebrado');
  await ativarFalso(page);
  const r = await perguntar(page, 'quais produtos de casa deram mais dinheiro no ano retrasado?');
  await expect(r).toHaveAttribute('data-tipo', 'esclarecer');
  await expect(r).toHaveAttribute('data-modo', 'ia');
  await r.getByText(/Como calculei/).click();
  await expect(r.locator('.como-calculei')).toContainText('spec rejeitado');
  await expect(r.locator('.como-calculei')).not.toContainText('SELECT');
});

test('reabrir a página reativa a IA sozinha (quem já ativou)', async ({ page }) => {
  await abrirPainel(page, '/?motor=falso');
  await ativarFalso(page);
  await page.reload();
  await esperarDashboard(page);
  await page.keyboard.press('/');
  await expect(page.locator('.status-ia[data-status="ia"]')).toBeVisible({ timeout: 30_000 });
});
