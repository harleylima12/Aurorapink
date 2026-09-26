/**
 * Modo Universal (Fase 5) no navegador, build de produção: arrastar planilha -> "Entendi assim" ->
 * dashboard automático -> Modo IA; modelo reconhecido na 2ª vez; vários arquivos; limites honestos.
 * Com PRINTS=1, grava docs/prints/fase5.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { RAIZ, violacoesCsp, vigiarCsp } from './ajuda';

const PASTA = path.join(RAIZ, 'docs', 'prints', 'fase5');
const PLANILHAS = path.join(RAIZ, 'evals', 'planilhas');
const prints = Boolean(process.env.PRINTS);
const ESPERADO = JSON.parse(readFileSync(path.join(PLANILHAS, 'esperado.json'), 'utf8')) as Record<string, { totais?: Record<string, number> }>;

async function abrirPlanilha(page: Page) {
  await vigiarCsp(page);
  await page.goto('/planilha');
  await expect(page.getByRole('heading', { name: 'Arraste sua planilha aqui' })).toBeVisible({ timeout: 60_000 });
}

/** Solta arquivos na zona como um arrastar-e-soltar de verdade (DataTransfer com File). */
async function soltar(page: Page, nomes: string[]) {
  const arquivos = nomes.map((n) => ({ nome: n, base64: readFileSync(path.join(PLANILHAS, n)).toString('base64') }));
  const zona = page.getByTestId('zona-arquivos');
  await zona.dispatchEvent('dragenter');
  await expect(zona).toHaveClass(/arrastando/);
  if (prints) await page.screenshot({ path: path.join(PASTA, '1-arrastar-planilha.png') });
  const dt = await page.evaluateHandle((lista) => {
    const d = new DataTransfer();
    for (const a of lista) {
      const bytes = Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0));
      d.items.add(new File([bytes], a.nome));
    }
    return d;
  }, arquivos);
  await zona.dispatchEvent('drop', { dataTransfer: dt });
}

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

test('arrastar -> Entendi assim -> dashboard automático, com números conferidos', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const externas: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(baseURL ?? '') && !/^(data|blob):/.test(r.url())) externas.push(r.url());
  });
  await abrirPlanilha(page);
  await soltar(page, ['vendas_br.csv']);

  await expect(page.getByRole('heading', { name: 'Entendi assim' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.relatorio-limpeza')).toContainText('Latin-1');
  await expect(page.locator('tr[data-coluna="Valor Total"]')).toHaveAttribute('data-tipo', 'dinheiro');
  await expect(page.locator('tr[data-coluna="Data da Venda"]')).toHaveAttribute('data-papel', 'tempo');
  await expect(page.locator('tr[data-coluna="Pago?"]')).toHaveAttribute('data-tipo', 'booleano');
  await expect(page.locator('.kpi-previa').first()).toContainText('Valor Total');
  const total = ESPERADO['vendas_br.csv']?.totais?.['Valor Total'] ?? 0;
  await expect(page.locator('.kpi-previa').first()).toContainText(brl(total).replace(/\s/g, ' '));

  // Edição: rótulo novo aparece na prévia.
  await page.getByRole('textbox', { name: 'Rótulo de Valor Total' }).fill('Receita');
  await expect(page.locator('.kpi-previa').first()).toContainText('Receita');
  if (prints) await page.screenshot({ path: path.join(PASTA, '2-entendi-assim.png'), fullPage: true });

  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'vendas_br' })).toBeVisible();
  await expect.poll(async () => Number(await page.locator('.kpi[data-metrica="soma_valor_total"] .kpi-valor').getAttribute('data-valor'))).toBeCloseTo(total, 2);
  await expect(page.locator('.kpi[data-metrica="registros"] .kpi-valor')).toHaveAttribute('data-valor', '1500');
  await expect(page.locator('[data-visual] canvas')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('[data-visual="detalhe"] tbody tr')).toHaveCount(50);
  await page.waitForTimeout(600);
  if (prints) await page.screenshot({ path: path.join(PASTA, '3-dashboard-automatico.png'), fullPage: true });

  // Modo IA sobre a planilha: chips com as colunas reais, Camada 0 respondendo.
  await page.getByRole('button', { name: /Modo IA/ }).click();
  await expect(page.locator('.painel-ia .chip').first()).toHaveText('Receita total');
  await page.locator('#campo-pergunta').fill('receita por categoria');
  await page.locator('#campo-pergunta').press('Enter');
  const r = page.locator('.painel-ia-corpo > .resposta').last();
  await expect(r).toHaveAttribute('data-tipo', 'dados', { timeout: 30_000 });
  await expect(r.locator('.resposta-titulo')).toContainText('Receita');
  await r.getByText(/Como calculei/).click();
  await expect(r.locator('.como-calculei')).toContainText('"categoria"');
  if (prints) await page.screenshot({ path: path.join(PASTA, '4-modo-ia-na-planilha.png') });

  expect(await violacoesCsp(page)).toEqual([]);
  expect(externas).toEqual([]);
});

test('mesma planilha de novo: reconhece o layout e abre direto', async ({ page }) => {
  await abrirPlanilha(page);
  await soltar(page, ['rh_ficticio.csv']);
  await expect(page.getByRole('heading', { name: 'Entendi assim' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('tr[data-coluna="CPF"]')).toHaveAttribute('data-tipo', 'pessoal');
  await expect(page.getByTestId('dados-sensiveis').locator('input')).toBeChecked();
  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  // Planilha com CPF e salário: dados sensíveis ligados por padrão (grupos < 5 escondidos, sem detalhe linha a linha).
  await expect(page.locator('[data-visual="protecao"]')).toContainText('menos de 5 registros');
  await expect(page.locator('[data-visual="detalhe"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Trocar planilha' }).click();
  await expect(page.locator('.lista-modelos')).toContainText('rh_ficticio');
  await soltar(page, ['rh_ficticio.csv']);
  await expect(page.locator('.reconhecido')).toContainText('Reconheci o layout do modelo “rh_ficticio”');
  await expect(page.getByRole('heading', { name: 'Entendi assim' })).toHaveCount(0);
});

test('vários arquivos: vendas + clientes ligados por "Cliente ID", RH sem relação', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirPlanilha(page);
  await soltar(page, ['vendas_br.csv', 'clientes.csv', 'rh_ficticio.csv']);
  await expect(page.getByRole('heading', { name: 'Como as planilhas se ligam' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.lista-ligacoes li').first()).toHaveAttribute('data-cobertura', '100');
  await expect(page.locator('.lista-planilhas')).toContainText('rh_ficticio.csv');
  await expect(page.locator('.lista-planilhas')).toContainText('não tem relação com as outras');
  if (prints) await page.screenshot({ path: path.join(PASTA, '5-varios-arquivos.png'), fullPage: true });
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Entendi assim' })).toBeVisible();
  await page.getByRole('button', { name: 'Gerar dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'vendas_br + clientes' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.kpi[data-metrica="registros"] .kpi-valor')).toHaveAttribute('data-valor', '1500');
});

test('limites honestos: planilha "desenhada" avisa; Excel com título e aba "Leia-me" é lido', async ({ page }) => {
  await abrirPlanilha(page);
  await soltar(page, ['desenhada.csv']);
  await expect(page.locator('.aviso-planilha[data-aviso="varias_tabelas"]')).toBeVisible({ timeout: 30_000 });
  if (prints) await page.screenshot({ path: path.join(PASTA, '6-planilha-desenhada.png') });
  await page.getByRole('button', { name: 'Trocar planilha' }).click();
  await soltar(page, ['financeiro_titulo_total.xlsx']);
  await expect(page.getByRole('heading', { name: 'Entendi assim' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.parte-cabecalho')).toContainText('aba "Dados"');
  await expect(page.locator('.relatorio-limpeza')).toContainText('linha de total');
  await expect(page.locator('tr[data-coluna="Receita"]')).toHaveAttribute('data-tipo', 'dinheiro');
  await expect(page.locator('tr[data-coluna="Margem %"]')).toHaveAttribute('data-tipo', 'porcentagem');
  if (prints) await page.screenshot({ path: path.join(PASTA, '7-excel.png') });
});
