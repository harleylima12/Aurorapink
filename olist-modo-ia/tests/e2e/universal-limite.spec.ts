/**
 * Limite real de tamanho do Modo Universal (seção 7A item 10): gera CSVs sintéticos DENTRO da página
 * (formato do vendas_br.csv) e mede do "soltar" até a tela "Entendi assim" e até o dashboard.
 * Lento: só roda com LIMITE=1. Resultado em evals/resultados/limite-planilha.json.
 *   LIMITE=1 npx playwright test universal-limite
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { RAIZ } from './ajuda';

test.skip(!process.env.LIMITE, 'defina LIMITE=1 para medir o limite de tamanho');

const TAMANHOS = (process.env.LIMITE_LINHAS ?? '100000,500000,1000000,2000000').split(',').map(Number);

test('tamanho x tempo de leitura no navegador', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  const resultados: Record<string, unknown>[] = [];
  for (const linhas of TAMANHOS) {
    await page.goto('/planilha');
    await expect(page.getByRole('heading', { name: 'Arraste sua planilha aqui' })).toBeVisible({ timeout: 60_000 });
    const mb = await page.evaluate((n) => {
      const cats = ['Eletrônicos', 'Casa', 'Moda', 'Beleza', 'Esporte'];
      const ufs = ['SP', 'RJ', 'MG', 'RS', 'PR', 'BA'];
      const partes = ['Data da Venda;Nº Pedido;Cliente ID;Produto;Categoria;UF;Cidade;Quantidade;Preço Unitário;Valor Total;Desconto (%);Vendedor;Pago?\n'];
      for (let i = 0; i < n; i++) {
        const d = `${String((i % 28) + 1).padStart(2, '0')}/${String((i % 12) + 1).padStart(2, '0')}/${2023 + (i % 2)}`;
        const v = ((i * 37) % 90000) / 100 + 10;
        partes.push(`${d};PED-${i};C${i % 5000};Produto ${i % 40};${cats[i % 5]};${ufs[i % 6]};Cidade ${i % 300};${(i % 5) + 1};R$ ${v.toFixed(2).replace('.', ',')};R$ ${(v * 2).toFixed(2).replace('.', ',')};${i % 20},0%;Vendedor ${i % 12};${i % 3 ? 'Sim' : 'Não'}\n`);
      }
      const arquivo = new File(partes, `sintetico_${n}.csv`);
      (window as unknown as { __arquivo: File }).__arquivo = arquivo;
      return arquivo.size / 2 ** 20;
    }, linhas);
    const t0 = Date.now();
    const erro = await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add((window as unknown as { __arquivo: File }).__arquivo);
      document.querySelector('[data-testid="zona-arquivos"]')?.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      return null;
    });
    void erro;
    const fim = await Promise.race([
      page.getByRole('heading', { name: 'Entendi assim' }).waitFor({ timeout: 5 * 60_000 }).then(() => 'ok' as const),
      page.locator('.erro-planilha').waitFor({ timeout: 5 * 60_000 }).then(() => 'erro' as const),
    ]).catch((e: unknown) => `falhou: ${String(e).slice(0, 200)}`);
    const leituraS = (Date.now() - t0) / 1000;
    let dashboardS: number | null = null;
    if (fim === 'ok') {
      await expect(page.locator('.kpi-previa').first()).toBeVisible({ timeout: 10 * 60_000 });
      const t1 = Date.now();
      // Sem salvar o layout: senão o tamanho seguinte (mesmo layout) seria reconhecido e pularia esta tela.
      await page.getByRole('checkbox', { name: /Lembrar este layout/ }).uncheck();
      await page.getByRole('button', { name: 'Gerar dashboard' }).click();
      await expect(page.locator('[data-visual] canvas').first()).toBeVisible({ timeout: 10 * 60_000 });
      dashboardS = (Date.now() - t1) / 1000;
    }
    const mensagem = fim === 'erro' ? await page.locator('.erro-planilha').innerText() : undefined;
    resultados.push({ linhas, mb: Math.round(mb * 10) / 10, resultado: fim, leituraS, dashboardS, mensagem });
    console.log(JSON.stringify(resultados.at(-1)));
    if (fim !== 'ok') break;
  }
  mkdirSync(path.join(RAIZ, 'evals', 'resultados'), { recursive: true });
  writeFileSync(path.join(RAIZ, 'evals', 'resultados', 'limite-planilha.json'), JSON.stringify({ ambiente: process.env.AMBIENTE ?? 'nuvem do Claude Code (Chromium headless, sem GPU)', resultados }, null, 2) + '\n');
});
