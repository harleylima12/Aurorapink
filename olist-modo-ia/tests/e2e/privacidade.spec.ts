/**
 * Privacidade (Fase 6): Service Worker "firewall" (contador, workers sob controle, bloqueio no modo estrito),
 * funcionamento offline (PWA) e "Apagar dados locais". O build de teste é o modo local (estrito).
 */
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { esperarDashboard, RAIZ, violacoesCsp, vigiarCsp } from './ajuda';

const PASTA = path.join(RAIZ, 'docs', 'prints', 'fase6');
const prints = Boolean(process.env.PRINTS);

interface EstadoSW {
  externas: number;
  bloqueadas: number;
  modo: string;
  porOrigem: Record<string, number>;
}

async function estadoSW(page: Page): Promise<EstadoSW> {
  return page.evaluate(
    () =>
      new Promise<EstadoSW>((ok) => {
        navigator.serviceWorker.addEventListener('message', function f(e: MessageEvent<EstadoSW & { tipo: string }>) {
          if (e.data.tipo !== 'firewall-estado') return;
          navigator.serviceWorker.removeEventListener('message', f);
          ok(e.data);
        });
        navigator.serviceWorker.controller?.postMessage({ tipo: 'estado' });
      }),
  );
}

test('firewall ativo desde a 1ª visita, contador 0 e workers do DuckDB sob o Service Worker', async ({ page }) => {
  await vigiarCsp(page);
  await page.goto('/');
  await esperarDashboard(page);
  const contador = page.locator('.rodape .contador-externas');
  await expect(contador).toHaveAttribute('data-firewall', 'ativo');
  await expect(contador).toHaveAttribute('data-externas', '0');
  await expect(page.locator('.selo-privacidade')).toContainText('Modo local (estrito)');
  const sw = await estadoSW(page);
  expect(sw.modo).toBe('estrito');
  expect(sw.externas).toBe(0);
  // A extensão parquet é baixada DE DENTRO do worker do DuckDB: se o worker não estivesse sob o SW, seria 0.
  expect(sw.porOrigem.worker).toBeGreaterThan(0);
  expect(sw.porOrigem['página']).toBeGreaterThan(0);
  if (prints) await page.locator('.rodape').screenshot({ path: path.join(PASTA, '1-selo-privacidade-contador-0.png') });
  expect(await violacoesCsp(page)).toEqual([]);
});

test('modo estrito: o Service Worker bloqueia requisição externa mesmo sem a CSP (segunda barreira)', async ({ browser, baseURL }) => {
  // bypassCSP desliga a CSP só neste teste, para provar que o SW sozinho também barra.
  const contexto = await browser.newContext({ bypassCSP: true, baseURL });
  const page = await contexto.newPage();
  // Se o SW deixasse passar, ELE faria o pedido à rede (o Playwright marca esses pedidos com serviceWorker()).
  let saiu = false;
  contexto.on('request', (r) => {
    if (r.url().startsWith('https://example.com') && r.serviceWorker()) saiu = true;
  });
  await page.goto('/');
  await esperarDashboard(page);
  const resultado = await page.evaluate(() =>
    fetch('https://example.com/rastreador.js', { mode: 'no-cors' }).then(
      () => 'passou',
      () => 'bloqueada',
    ),
  );
  expect(resultado).toBe('bloqueada');
  await expect(page.locator('.rodape .contador-externas')).toHaveAttribute('data-externas', '1');
  await expect(page.locator('.rodape .contador-externas')).toContainText('1 bloqueadas');
  await page.locator('.selo-privacidade summary').click();
  await expect(page.locator('.lista-rede')).toContainText('⛔ example.com/rastreador.js');
  if (prints) await page.locator('.rodape').screenshot({ path: path.join(PASTA, '2-requisicao-bloqueada.png') });
  expect(saiu).toBe(false);
  await contexto.close();
});

test('offline: depois da 1ª visita, o dashboard abre sem internet (PWA)', async ({ page, context }) => {
  await page.goto('/');
  await esperarDashboard(page);
  await page.reload();
  await esperarDashboard(page);
  await context.setOffline(true);
  await page.reload();
  await esperarDashboard(page);
  await expect(page.locator('.kpi[data-metrica="faturamento"] .kpi-valor')).toHaveAttribute('data-valor', /^13494400\.7/);
  if (prints) await page.screenshot({ path: path.join(PASTA, '3-offline.png') });
  const manifesto = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href'));
  expect(manifesto).toBe('/manifest.webmanifest');
  await context.setOffline(false);
});

test('apagar dados locais limpa cache, IndexedDB e localStorage', async ({ page }) => {
  await page.goto('/');
  await esperarDashboard(page);
  await page.evaluate(async () => {
    localStorage.setItem('olist-modo-ia:fixados', '[{"id":"x"}]');
    await new Promise<void>((ok) => {
      const r = indexedDB.open('olist-modo-ia', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('ultima-planilha');
      r.onsuccess = () => {
        r.result.close();
        ok();
      };
    });
  });
  expect(await page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Apagar dados locais' }).click();
  await page.getByRole('button', { name: 'Sim, apagar tudo' }).click();
  const relatorio = page.getByTestId('relatorio-apagar');
  await expect(relatorio).toContainText('1 banco IndexedDB');
  await expect(relatorio).toContainText(/Apagado: [1-9][\d.]*,\d MB em 1 cache/);
  if (prints) await page.locator('.rodape').screenshot({ path: path.join(PASTA, '4-apagar-dados-locais.png') });
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(async () => (await caches.keys()).length)).toBe(0);
  expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
});
