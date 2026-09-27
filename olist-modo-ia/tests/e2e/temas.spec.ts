/**
 * Fase 5B no navegador (build de produção): exemplos por tema na tela inicial, tema + confiança + porquê,
 * perguntas rápidas (objetivo, público, papel que falta), dashboard pela receita do tema, modelo salvo com o tema.
 * Com PRINTS=1, grava docs/prints/fase5b.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { RAIZ, violacoesCsp, vigiarCsp } from './ajuda';

const PASTA = path.join(RAIZ, 'docs', 'prints', 'fase5b');
const prints = Boolean(process.env.PRINTS);
if (prints) mkdirSync(PASTA, { recursive: true });
const foto = async (page: Page, nome: string, fullPage = true) => {
  if (!prints) return;
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(PASTA, nome), fullPage });
};

/** Soma de uma coluna de um CSV de exemplo com ";" e vírgula decimal (conferência independente do app). */
function somaCsv(arquivo: string, coluna: string, filtro?: { coluna: string; valor: string }): number {
  const [cab, ...linhas] = readFileSync(path.join(RAIZ, 'public', 'exemplos', arquivo), 'utf8').trim().split('\n');
  const nomes = cab!.split(';');
  const i = nomes.indexOf(coluna);
  const f = filtro ? nomes.indexOf(filtro.coluna) : -1;
  return linhas
    .map((l) => l.split(';'))
    .filter((c) => !filtro || c[f] === filtro.valor)
    .reduce((t, c) => t + Number(c[i]!.replace(/\./g, '').replace(',', '.')), 0);
}

async function abrirPlanilha(page: Page) {
  await vigiarCsp(page);
  await page.goto('/planilha');
  await expect(page.getByRole('heading', { name: 'Arraste sua planilha aqui' })).toBeVisible({ timeout: 60_000 });
}

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

const kpi = (page: Page, metrica: string) => page.locator(`.kpi[data-metrica="${metrica}"] .kpi-valor`);

test('Vendas pelo exemplo: tema com porquê, objetivo "produtos campeões" + público "gestor", números conferidos', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const externas: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(baseURL ?? '') && !/^(data|blob):/.test(r.url())) externas.push(r.url());
  });
  await abrirPlanilha(page);
  await expect(page.getByTestId('exemplos-tema').locator('.chip')).toHaveCount(8);
  await foto(page, '1-exemplos-na-entrada.png', false);
  await page.locator('[data-exemplo="vendas"]').click();

  await expect(page.getByRole('heading', { name: 'Entendi assim' })).toBeVisible({ timeout: 30_000 });
  const cartao = page.locator('.tema-cartao');
  await expect(cartao).toHaveAttribute('data-tema', 'vendas');
  await expect(cartao.getByRole('heading')).toContainText('Parece uma planilha de Vendas / E-commerce');
  await expect(page.getByTestId('tema-porque')).toContainText('Confiança alta');
  await expect(page.getByTestId('tema-porque')).toContainText('encontrei Pedido, Data do Pedido, Total do Pedido');
  await expect(page.locator('.kpi-previa').first()).toContainText('Faturamento');

  await cartao.locator('[data-pergunta="objetivo"]').getByRole('button', { name: 'Achar os produtos campeões' }).click();
  await cartao.locator('[data-pergunta="publico"]').getByRole('button', { name: 'Gestor' }).click();
  await expect(cartao.locator('[data-pergunta="publico"] [aria-pressed="true"]')).toHaveText('Gestor');
  await expect(page.locator('.kpi-previa').nth(1)).toContainText('Unidades vendidas');
  await foto(page, '2-entendi-assim-tema-e-perguntas.png');

  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  await expect(page.getByTestId('tema-dashboard')).toContainText('Vendas / E-commerce · Achar os produtos campeões · para: Gestor', { timeout: 30_000 });
  const total = somaCsv('exemplo_vendas.csv', 'Total do Pedido');
  await expect.poll(async () => Number(await kpi(page, 't_faturamento').getAttribute('data-valor'))).toBeCloseTo(total, 2);
  const unidades = somaCsv('exemplo_vendas.csv', 'Qtd');
  await expect(kpi(page, 't_unidades')).toHaveAttribute('data-valor', String(unidades));
  // Gestor: 4 painéis, o 1º é o do objetivo, sem tabela linha a linha.
  const paineis = page.locator('[data-visual^="tema-"]');
  await expect(paineis).toHaveCount(4);
  await expect(paineis.first().getByRole('heading')).toHaveText('Produtos campeões');
  await expect(page.locator('[data-visual="detalhe"]')).toHaveCount(0);
  await expect(page.locator('[data-visual="escondidos"]')).toContainText('não achei a coluna de vendedor');
  await expect(page.locator('[data-visual] canvas')).toHaveCount(4, { timeout: 30_000 });
  await foto(page, '3-dashboard-vendas-gestor.png');

  // Modo IA: perguntas sugeridas pela receita, respondidas pela Camada 0 (sem IA).
  await page.getByRole('button', { name: /Modo IA/ }).click();
  await expect(page.locator('.painel-ia .chip').first()).toHaveText('Faturamento mês a mês');
  await page.locator('.painel-ia .chip', { hasText: 'Top 5 produto por faturamento' }).click();
  const r = page.locator('.painel-ia-corpo > .resposta').last();
  await expect(r).toHaveAttribute('data-tipo', 'dados', { timeout: 30_000 });
  await r.getByText(/Como calculei/).click();
  await expect(r.locator('.como-calculei')).toContainText('SUM("total_do_pedido")');
  await foto(page, '4-modo-ia-perguntas-do-tema.png', false);

  expect(await violacoesCsp(page)).toEqual([]);
  expect(externas).toEqual([]);
});

test('Financeiro e RH pelos exemplos: saldo = entradas − saídas; RH sensível com a proteção ligada', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirPlanilha(page);
  await page.locator('[data-exemplo="financeiro"]').click();
  await expect(page.locator('.tema-cartao')).toHaveAttribute('data-tema', 'financeiro', { timeout: 30_000 });
  await expect(page.getByTestId('tema-porque')).toContainText('valores do tipo entrada/saída em "Tipo"');
  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  const entradas = somaCsv('exemplo_financeiro.csv', 'Valor', { coluna: 'Tipo', valor: 'Entrada' });
  const saidas = somaCsv('exemplo_financeiro.csv', 'Valor', { coluna: 'Tipo', valor: 'Saída' });
  await expect.poll(async () => Number(await kpi(page, 't_entradas').getAttribute('data-valor')), { timeout: 30_000 }).toBeCloseTo(entradas, 2);
  await expect.poll(async () => Number(await kpi(page, 't_saidas').getAttribute('data-valor'))).toBeCloseTo(saidas, 2);
  await expect.poll(async () => Number(await kpi(page, 't_saldo').getAttribute('data-valor'))).toBeCloseTo(entradas - saidas, 2);
  await expect(page.locator('[data-visual="tema-saldo_mes"]')).toBeVisible();
  await foto(page, '5-dashboard-financeiro.png');

  await page.getByRole('button', { name: 'Trocar planilha' }).click();
  await page.locator('[data-exemplo="rh"]').click();
  await expect(page.locator('.tema-cartao')).toHaveAttribute('data-tema', 'rh', { timeout: 30_000 });
  await expect(page.locator('.tema-cartao')).toContainText('Tema sensível');
  await expect(page.getByTestId('dados-sensiveis').locator('input')).toBeChecked();
  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  await expect(page.locator('[data-visual="protecao"]')).toContainText('menos de 5 registros', { timeout: 30_000 });
  await expect(kpi(page, 't_pessoas')).toHaveAttribute('data-valor', '180');
  await expect(page.locator('[data-visual="tema-pessoas_depto"]')).toBeVisible();
  await foto(page, '6-dashboard-rh-sensivel.png');
});

test('confiança baixa: pergunta o tema; papel que falta vira pergunta; "não tem" esconde e explica', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirPlanilha(page);
  await soltar(page, 'clientes.csv');
  const cartao = page.locator('.tema-cartao');
  await expect(cartao).toHaveAttribute('data-confianca', 'baixa', { timeout: 30_000 });
  await expect(cartao.getByRole('heading')).toContainText('Não reconheci um tema');
  const perguntaTema = cartao.locator('[data-pergunta="tema"]');
  await expect(perguntaTema).toContainText('Esta planilha é de quê?');
  await foto(page, '7-confianca-baixa-pergunta-tema.png');
  await perguntaTema.getByRole('button', { name: /Vendas/ }).click();
  await expect(cartao).toHaveAttribute('data-tema', 'vendas');
  const papel = cartao.locator('[data-pergunta="papel"]');
  await expect(papel).toContainText('Qual coluna é o valor principal (em R$)?');
  await papel.locator('select').selectOption('__nao');
  await expect(papel).toHaveCount(0);
  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  await expect(page.locator('[data-visual="escondidos"]')).toContainText('não achei a coluna de valor', { timeout: 30_000 });
  await expect(kpi(page, 't_clientes')).toHaveAttribute('data-valor', '300');
  await foto(page, '8-painel-escondido-explicado.png');
});

test('modelo salvo guarda tema e respostas: a mesma planilha abre direto com o mesmo objetivo e público', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirPlanilha(page);
  await page.locator('[data-exemplo="estoque"]').click();
  const cartao = page.locator('.tema-cartao');
  await expect(cartao).toHaveAttribute('data-tema', 'estoque', { timeout: 30_000 });
  await cartao.locator('[data-pergunta="objetivo"]').getByRole('button', { name: 'Acompanhar as movimentações' }).click();
  await cartao.locator('[data-pergunta="publico"]').getByRole('button', { name: 'Cliente' }).click();
  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  await expect(page.getByTestId('tema-dashboard')).toContainText('Acompanhar as movimentações · para: Cliente', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Trocar planilha' }).click();
  await page.locator('[data-exemplo="estoque"]').click();
  await expect(page.locator('.reconhecido')).toContainText('Reconheci o layout', { timeout: 30_000 });
  await expect(page.getByTestId('tema-dashboard')).toContainText('Estoque / Operações · Acompanhar as movimentações · para: Cliente');
  await expect(page.locator('[data-visual^="tema-"]')).toHaveCount(3);
  await foto(page, '9-modelo-salvo-abre-direto.png');
});

test('IA local opcional (motor falso): só metadados; com confiança baixa, a sugestão dela decide o tema', async ({ page }) => {
  test.setTimeout(120_000);
  await vigiarCsp(page);
  await page.goto('/planilha?motor=falso');
  await expect(page.getByRole('heading', { name: 'Arraste sua planilha aqui' })).toBeVisible({ timeout: 60_000 });
  await soltar(page, 'clientes.csv');
  const cartao = page.locator('.tema-cartao');
  await expect(cartao).toHaveAttribute('data-tema', 'generico', { timeout: 30_000 });
  await cartao.getByRole('button', { name: /Pedir sugestão à IA local/ }).click();
  const ia = page.getByTestId('sugestao-ia');
  await expect(ia).toContainText('sugeriu Vendas / E-commerce; a detecção por nomes estava com confiança baixa, então usei a sugestão da IA', { timeout: 30_000 });
  await expect(cartao).toHaveAttribute('data-tema', 'vendas');
  await expect(cartao.getByRole('heading').first()).toContainText('(sugerido pela IA local)');
  await ia.getByText('O que a IA recebeu').click();
  const recebido = (await ia.locator('pre').textContent()) ?? '';
  expect(recebido).toContain('"tipo":"dado pessoal"');
  expect(recebido).not.toMatch(/@|\d{3}\.\d{3}\.\d{3}-\d{2}|Atacado/);
  await expect(page.locator('tr[data-coluna="Cliente ID"] input')).toHaveValue('Cliente ID (IA)');
  await foto(page, '10-sugestao-ia-local.png');
  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  await page.getByRole('button', { name: /Modo IA/ }).click();
  await expect(page.locator('.painel-ia .chip').first()).toHaveText('Quais segmentos têm mais clientes?', { timeout: 30_000 });
  expect(await violacoesCsp(page)).toEqual([]);
});
