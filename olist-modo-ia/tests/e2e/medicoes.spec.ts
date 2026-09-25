/**
 * Medições de desempenho (docs/BENCHMARK.md). Grava evals/resultados/medicoes.json.
 * Mede no localhost: não inclui o tempo de download pela internet (ver BENCHMARK.md).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { esperarDashboard, esperarKpi, RAIZ } from './ajuda';

const RODADAS = Number(process.env.RODADAS ?? 5);

interface Marcas {
  fcp: number;
  motorPronto: number;
  graficosProntos: number;
}

async function marcas(page: Page): Promise<Marcas> {
  await esperarDashboard(page);
  return page.evaluate(() => {
    const t = (nome: string) => Math.round(performance.getEntriesByName(nome)[0]?.startTime ?? Number.NaN);
    return { fcp: t('first-contentful-paint'), motorPronto: t('motor-pronto'), graficosProntos: t('graficos-prontos') };
  });
}

function mediana(valores: number[]): number {
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? (o[m] ?? 0) : Math.round(((o[m - 1] ?? 0) + (o[m] ?? 0)) / 2);
}

test('carga fria, carga com cache e troca de filtro', async ({ browser }) => {
  test.setTimeout(RODADAS * 60_000);
  const frias: Marcas[] = [];
  const quentes: Marcas[] = [];
  const filtros: number[] = [];

  for (let i = 0; i < RODADAS; i++) {
    const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } }); // cache vazio
    const page = await contexto.newPage();
    await page.goto('/');
    frias.push(await marcas(page));
    await page.reload(); // mesmo contexto: WASM e dados no cache HTTP
    quentes.push(await marcas(page));

    // Troca de filtro medida DENTRO da página: do evento "change" até o KPI mostrar o valor novo.
    const medicao = page.evaluate(
      () =>
        new Promise<number>((resolver) => {
          const select = document.querySelector<HTMLSelectElement>('.filtros select');
          const kpi = document.querySelector('.kpi[data-metrica="faturamento"] .kpi-valor');
          let inicio = 0;
          select?.addEventListener('change', () => (inicio = performance.now()), { once: true, capture: true });
          const observador = new MutationObserver(() => {
            const atual = document.querySelector('.kpi[data-metrica="faturamento"] .kpi-valor');
            if (inicio && atual?.getAttribute('data-valor') === '6108492.27') {
              observador.disconnect();
              resolver(performance.now() - inicio);
            }
          });
          observador.observe(kpi?.closest('.kpis') ?? document.body, { subtree: true, attributes: true, childList: true });
        }),
    );
    await page.getByRole('combobox', { name: 'Ano', exact: true }).selectOption('2017');
    filtros.push(Math.round(await medicao));
    await esperarKpi(page, 'faturamento', 6_108_492.27);
    await contexto.close();
  }

  const resumo = {
    rodadas: RODADAS,
    fria: {
      fcp: mediana(frias.map((m) => m.fcp)),
      motorPronto: mediana(frias.map((m) => m.motorPronto)),
      graficosProntos: mediana(frias.map((m) => m.graficosProntos)),
    },
    quente: {
      fcp: mediana(quentes.map((m) => m.fcp)),
      motorPronto: mediana(quentes.map((m) => m.motorPronto)),
      graficosProntos: mediana(quentes.map((m) => m.graficosProntos)),
    },
    trocaDeFiltroMs: { mediana: mediana(filtros), max: Math.max(...filtros) },
    brutos: { frias, quentes, filtros },
  };
  const pasta = path.join(RAIZ, 'evals', 'resultados');
  mkdirSync(pasta, { recursive: true });
  writeFileSync(path.join(pasta, 'medicoes.json'), `${JSON.stringify(resumo, null, 2)}\n`);
  console.log(JSON.stringify({ fria: resumo.fria, quente: resumo.quente, filtro: resumo.trocaDeFiltroMs }));

  // Meta da seção 16: primeira pintura < 2 s.
  expect(resumo.fria.fcp).toBeLessThan(2_000);
});
