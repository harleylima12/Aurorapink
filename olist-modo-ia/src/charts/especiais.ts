/**
 * Gráficos próprios por tema (Fase 5C). Funções puras: recebem as linhas que o DuckDB devolveu e a paleta do tema,
 * e devolvem as opções do ECharts. Quando a forma pede uma conta sobre as linhas (participação acumulada da curva
 * ABC, média móvel, soma corrida, "quantos chegaram a cada etapa"), a conta está aqui, é determinística e tem
 * teste (tests/unit/especiais.test.ts). Nenhum número vem da IA.
 *
 * Regras de desenho (método de dataviz, D64): um eixo só (nunca dois); cor de identidade na ordem da paleta;
 * rótulos seletivos; tooltip em toda marca; vermelho só em alerta; textos dos dados sempre escapados.
 */
import type { EChartsCoreOption } from 'echarts/core';

import { formatar } from '../format/numeros';
import type { Formato } from '../semantic/schema';
import { classesAbc, mediaMovel, somaCorrida } from './contas';
import { escapar } from './opcoes';
import { rampaOrdinal, rampaSequencial, type PaletaTema } from './paletas';
import { CORES } from './tema';

export { classesAbc, etapasDoStatus, faixasHistograma, funilAcumulado, mediaMovel, somaCorrida } from './contas';

const GRID = { left: 8, right: 24, top: 36, bottom: 8, containLabel: true };
const TEXTO = { color: CORES.textoSecundario, fontSize: 11 };
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const compacto = (v: number | null, f: Formato) => formatar(v, f, { compacto: true });
const aria = (descricao: string) => ({ aria: { enabled: true, label: { description: descricao } } });
const legenda = (nomes: string[]) => ({ legend: { top: 0, left: 0, data: nomes, textStyle: { color: CORES.texto, fontSize: 11 }, itemWidth: 12, itemHeight: 8 } });

// --- Construtores -----------------------------------------------------------------------------------------------

export interface Serie {
  nome: string;
  valores: (number | null)[];
}

function tooltipEixo(formato: Formato) {
  return {
    trigger: 'axis',
    formatter: (params: unknown) => {
      const lista = (Array.isArray(params) ? params : [params]) as { axisValueLabel?: unknown; seriesName?: unknown; value?: unknown; marker?: unknown }[];
      const cab = escapar(lista[0]?.axisValueLabel);
      return `${cab}<br/>${lista.map((p) => `${String(p.marker ?? '')}${escapar(p.seriesName)}: <b>${escapar(formatar(numero(p.value), formato))}</b>`).join('<br/>')}`;
    },
  };
}

/** Linha com média móvel tracejada (mesmo eixo, mesma unidade). */
export function opcoesMediaMovel(rotulos: string[], serie: Serie, formato: Formato, paleta: PaletaTema, descricao: string): EChartsCoreOption {
  const media = mediaMovel(serie.valores, 3);
  return {
    ...aria(descricao),
    ...legenda([serie.nome, 'Média de 3 meses']),
    grid: GRID,
    tooltip: tooltipEixo(formato),
    xAxis: { type: 'category', data: rotulos, boundaryGap: false, axisLabel: TEXTO },
    yAxis: { type: 'value', axisLabel: { ...TEXTO, formatter: (v: number) => compacto(v, formato) } },
    series: [
      { name: serie.nome, type: 'line', data: serie.valores, symbolSize: 6, lineStyle: { width: 2, color: paleta.destaque }, itemStyle: { color: paleta.destaque }, areaStyle: { color: paleta.destaque, opacity: 0.08 } },
      { name: 'Média de 3 meses', type: 'line', data: media, symbol: 'none', lineStyle: { width: 2, type: 'dashed', color: CORES.texto }, itemStyle: { color: CORES.texto } },
    ],
  };
}

/** Soma corrida no tempo (ex.: saldo acumulado). Abaixo de zero, a área fica vermelha (alerta). */
export function opcoesAcumulado(rotulos: string[], serie: Serie, formato: Formato, paleta: PaletaTema, descricao: string): EChartsCoreOption {
  const valores = somaCorrida(serie.valores);
  const negativo = valores.some((v) => v < 0);
  return {
    ...aria(descricao),
    grid: { ...GRID, top: 16 },
    tooltip: tooltipEixo(formato),
    xAxis: { type: 'category', data: rotulos, boundaryGap: false, axisLabel: TEXTO },
    yAxis: { type: 'value', axisLabel: { ...TEXTO, formatter: (v: number) => compacto(v, formato) } },
    ...(negativo ? { visualMap: { show: false, dimension: 1, pieces: [{ lt: 0, color: CORES.alerta }, { gte: 0, color: paleta.destaque }] } } : {}),
    series: [
      {
        name: `${serie.nome} acumulado`,
        type: 'line',
        data: valores,
        symbolSize: 5,
        lineStyle: { width: 2, color: paleta.destaque },
        itemStyle: { color: paleta.destaque },
        areaStyle: { opacity: 0.12 },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: CORES.borda }, data: [{ yAxis: 0 }], label: { show: false } },
      },
    ],
  };
}

/** Curva ABC sem segundo eixo: barras pintadas pela classe (rampa de UMA cor), participação acumulada no tooltip. */
export function opcoesPareto(categorias: string[], valores: (number | null)[], serie: string, formato: Formato, paleta: PaletaTema, descricao: string): EChartsCoreOption {
  const abc = classesAbc(valores);
  const [cA, cB, cC] = rampaOrdinal(paleta.destaque, 3) as [string, string, string];
  const cor = { A: cA, B: cB, C: cC };
  const quantos = (k: 'A' | 'B' | 'C') => abc.filter((x) => x.classe === k).length;
  return {
    ...aria(descricao),
    legend: {
      top: 0,
      left: 0,
      textStyle: { color: CORES.texto, fontSize: 11 },
      data: [`A: ${quantos('A')} itens (80% do total)`, `B: ${quantos('B')} itens (próximos 15%)`, `C: ${quantos('C')} itens (5% final)`],
    },
    grid: GRID,
    tooltip: {
      trigger: 'item',
      formatter: (p: { name?: unknown; value?: unknown; dataIndex?: number }) => {
        const x = abc[p.dataIndex ?? -1];
        return `${escapar(p.name)}<br/>${escapar(serie)}: <b>${escapar(formatar(numero(p.value), formato))}</b><br/>Acumulado: <b>${formatar(x?.acumulado ?? null, 'pct')}</b> · classe ${x?.classe ?? ''}`;
      },
    },
    xAxis: { type: 'category', data: categorias, axisLabel: { ...TEXTO, interval: 0, rotate: categorias.length > 8 ? 35 : 0, width: 90, overflow: 'truncate' } },
    yAxis: { type: 'value', axisLabel: { ...TEXTO, formatter: (v: number) => compacto(v, formato) } },
    series: (['A', 'B', 'C'] as const).map((k, i) => ({
      name: [`A: ${quantos('A')} itens (80% do total)`, `B: ${quantos('B')} itens (próximos 15%)`, `C: ${quantos('C')} itens (5% final)`][i],
      type: 'bar',
      stack: 'abc',
      barCategoryGap: '20%',
      itemStyle: { color: cor[k], borderRadius: [4, 4, 0, 0] },
      data: valores.map((v, j) => (abc[j]?.classe === k ? v : null)),
    })),
  };
}

/** Treemap de participação (uma cor, tons pela ordem): bom para "onde está o dinheiro". */
export function opcoesTreemap(categorias: string[], valores: (number | null)[], serie: string, formato: Formato, paleta: PaletaTema, descricao: string): EChartsCoreOption {
  const total = valores.reduce<number>((s, v) => s + Math.max(0, v ?? 0), 0);
  const tons = rampaOrdinal(paleta.destaque, 4);
  return {
    ...aria(descricao),
    tooltip: {
      formatter: (p: { name?: unknown; value?: unknown }) =>
        `${escapar(p.name)}<br/>${escapar(serie)}: <b>${escapar(formatar(numero(p.value), formato))}</b> (${formatar(total ? (numero(p.value) ?? 0) / total : null, 'pct')})`,
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
        itemStyle: { borderColor: CORES.painel, borderWidth: 2, gapWidth: 2 },
        label: { color: CORES.fundo, fontSize: 12, fontWeight: 600, formatter: (p: { name?: string; value?: unknown }) => `${p.name ?? ''}\n${compacto(numero(p.value), formato)}` },
        data: categorias.map((c, i) => ({ name: c, value: Math.max(0, valores[i] ?? 0), itemStyle: { color: tons[Math.min(tons.length - 1, Math.floor((i / Math.max(1, categorias.length)) * tons.length))] } })),
      },
    ],
  };
}

/** Funil em etapas ordenadas (rampa ordinal de uma cor); o texto de cada etapa traz o número e a % da 1ª. */
export function opcoesFunil(etapas: { etapa: string; n: number | null }[], formato: Formato, paleta: PaletaTema, descricao: string): EChartsCoreOption {
  const cores = rampaOrdinal(paleta.destaque, etapas.length);
  const primeiro = etapas[0]?.n ?? 0;
  return {
    ...aria(descricao),
    tooltip: { formatter: (p: { name?: unknown; value?: unknown }) => `${escapar(p.name)}: <b>${escapar(formatar(numero(p.value), formato))}</b>` },
    series: [
      {
        type: 'funnel',
        sort: 'none',
        top: 8,
        bottom: 8,
        left: '4%',
        width: '58%',
        gap: 2,
        minSize: '6%',
        // Rótulo fora da forma: etapas pequenas (cliques, conversões) continuam legíveis.
        label: {
          position: 'right',
          color: CORES.texto,
          fontSize: 12,
          formatter: (p: { name?: string; value?: unknown }) => `${p.name ?? ''}: ${compacto(numero(p.value), formato)}${primeiro ? ` (${formatar((numero(p.value) ?? 0) / primeiro, 'pct')})` : ''}`,
        },
        labelLine: { show: true, lineStyle: { color: CORES.borda } },
        itemStyle: { borderColor: CORES.painel, borderWidth: 2 },
        data: etapas.map((e, i) => ({ name: e.etapa, value: e.n ?? 0, itemStyle: { color: cores[i] } })),
      },
    ],
  };
}

/** Cascata entradas -> saídas -> saldo. Saldo negativo em vermelho (alerta), com o sinal no rótulo. */
export function opcoesCascataFinanceira(entradas: number, saidas: number, saldo: number, paleta: PaletaTema, descricao: string): EChartsCoreOption {
  const base = [0, Math.max(0, entradas - saidas), 0];
  const valores = [entradas, saidas, Math.abs(saldo)];
  const cores = [paleta.entrada ?? paleta.destaque, paleta.saida ?? CORES.textoSecundario, saldo < 0 ? CORES.alerta : paleta.destaque];
  const rotulos = ['Entradas', 'Saídas', saldo < 0 ? 'Saldo (negativo)' : 'Saldo'];
  const sinal = ['+', '−', saldo < 0 ? '−' : '='];
  return {
    ...aria(descricao),
    grid: { ...GRID, top: 24 },
    tooltip: { trigger: 'item', formatter: (p: { dataIndex?: number }) => `${rotulos[p.dataIndex ?? 0]}: <b>${formatar([entradas, -saidas, saldo][p.dataIndex ?? 0] ?? null, 'brl')}</b>` },
    xAxis: { type: 'category', data: rotulos, axisLabel: { ...TEXTO, color: CORES.texto } },
    yAxis: { type: 'value', axisLabel: { ...TEXTO, formatter: (v: number) => compacto(v, 'brl') } },
    series: [
      { type: 'bar', stack: 'c', silent: true, itemStyle: { color: 'transparent' }, data: base },
      {
        type: 'bar',
        stack: 'c',
        barMaxWidth: 90,
        data: valores.map((v, i) => ({ value: v, itemStyle: { color: cores[i], borderRadius: 4 } })),
        label: { show: true, position: 'top', color: CORES.texto, formatter: (p: { dataIndex?: number; value?: unknown }) => `${sinal[p.dataIndex ?? 0]} ${compacto(numero(p.value), 'brl')}` },
      },
    ],
  };
}

/** Duas ou mais séries lado a lado, UM eixo (mesma unidade). Financeiro usa entrada/saída; os outros, a paleta. */
export function opcoesLadoALado(categorias: string[], series: Serie[], formato: Formato, paleta: PaletaTema, descricao: string, cores?: string[]): EChartsCoreOption {
  const cs = cores ?? paleta.categorica;
  return {
    ...aria(descricao),
    ...legenda(series.map((s) => s.nome)),
    grid: GRID,
    tooltip: { ...tooltipEixo(formato), axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: categorias, axisLabel: { ...TEXTO, hideOverlap: true } },
    yAxis: { type: 'value', axisLabel: { ...TEXTO, formatter: (v: number) => compacto(v, formato) } },
    series: series.map((s, i) => ({ name: s.nome, type: 'bar', barGap: '10%', barMaxWidth: 26, itemStyle: { color: cs[i], borderRadius: [4, 4, 0, 0] }, data: s.valores })),
  };
}

/** Histograma: colunas encostadas (uma cor), uma por faixa. */
export function opcoesHistograma(faixas: string[], valores: (number | null)[], paleta: PaletaTema, descricao: string): EChartsCoreOption {
  return {
    ...aria(descricao),
    grid: { ...GRID, top: 16 },
    tooltip: { trigger: 'item', formatter: (p: { name?: unknown; value?: unknown }) => `${escapar(p.name)}: <b>${formatar(numero(p.value), 'int')}</b> registros` },
    xAxis: { type: 'category', data: faixas, axisLabel: { ...TEXTO, interval: 0, rotate: faixas.length > 7 ? 30 : 0 } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: TEXTO },
    series: [{ type: 'bar', barCategoryGap: '4%', itemStyle: { color: paleta.destaque, borderRadius: [3, 3, 0, 0] }, data: valores, label: { show: faixas.length <= 10, position: 'top', color: CORES.texto, fontSize: 10 } }],
  };
}

/** Mediana e metade do meio (p25–p75) por categoria: caixa sem bigodes (dito no subtítulo). */
export function opcoesCaixa(categorias: string[], p25: (number | null)[], mediana: (number | null)[], p75: (number | null)[], formato: Formato, paleta: PaletaTema, descricao: string): EChartsCoreOption {
  return {
    ...aria(descricao),
    grid: { ...GRID, top: 16 },
    tooltip: {
      trigger: 'item',
      formatter: (p: { dataIndex?: number }) => {
        const i = p.dataIndex ?? 0;
        return `${escapar(categorias[i])}<br/>p25: ${escapar(formatar(p25[i] ?? null, formato))}<br/>mediana: <b>${escapar(formatar(mediana[i] ?? null, formato))}</b><br/>p75: ${escapar(formatar(p75[i] ?? null, formato))}`;
      },
    },
    xAxis: { type: 'value', scale: true, axisLabel: { ...TEXTO, formatter: (v: number) => compacto(v, formato) } },
    yAxis: { type: 'category', data: categorias, inverse: true, axisLabel: { ...TEXTO, width: 140, overflow: 'truncate' } },
    series: [
      {
        type: 'boxplot',
        itemStyle: { color: paleta.destaque, borderColor: CORES.texto, borderWidth: 1.5, opacity: 0.9 },
        boxWidth: [8, 22],
        data: categorias.map((_, i) => [p25[i], p25[i], mediana[i], p75[i], p75[i]]),
      },
    ],
  };
}

/** Atual × mínimo por item: barra do atual (destaque; vermelha abaixo do mínimo) e traço do mínimo. */
export function opcoesBullet(itens: string[], atual: (number | null)[], minimo: (number | null)[], paleta: PaletaTema, descricao: string): EChartsCoreOption {
  return {
    ...aria(descricao),
    ...legenda(['Estoque atual', 'Estoque mínimo', 'Abaixo do mínimo']),
    grid: GRID,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const i = ((Array.isArray(params) ? params[0] : params) as { dataIndex?: number }).dataIndex ?? 0;
        const abaixo = (atual[i] ?? 0) < (minimo[i] ?? 0);
        return `${escapar(itens[i])}<br/>Atual: <b>${formatar(atual[i] ?? null, 'int')}</b><br/>Mínimo: ${formatar(minimo[i] ?? null, 'int')}${abaixo ? '<br/>⚠ abaixo do mínimo' : ''}`;
      },
    },
    xAxis: { type: 'value', axisLabel: TEXTO },
    yAxis: { type: 'category', data: itens, inverse: true, axisLabel: { ...TEXTO, width: 130, overflow: 'truncate' } },
    series: [
      {
        name: 'Estoque atual',
        type: 'bar',
        barMaxWidth: 14,
        itemStyle: { color: paleta.destaque },
        data: atual.map((v, i) => ({ value: v, itemStyle: { color: (v ?? 0) < (minimo[i] ?? 0) ? CORES.alerta : paleta.destaque, borderRadius: [0, 4, 4, 0] } })),
      },
      { name: 'Estoque mínimo', type: 'scatter', symbol: 'rect', symbolSize: [3, 20], itemStyle: { color: CORES.texto }, data: minimo.map((v, i) => [v, i]) },
      { name: 'Abaixo do mínimo', type: 'bar', data: [], itemStyle: { color: CORES.alerta } },
    ],
  };
}

/** Mapa de calor: rampa de UMA cor (mais valor = mais claro no escuro). Células vazias ficam no fundo. */
export function opcoesHeatmap(eixoX: string[], eixoY: string[], celulas: [number, number, number | null][], serie: string, formato: Formato, paleta: PaletaTema, descricao: string): EChartsCoreOption {
  const valores = celulas.map((c) => c[2]).filter((v): v is number => v !== null);
  return {
    ...aria(descricao),
    grid: { left: 8, right: 16, top: 8, bottom: 48, containLabel: true },
    tooltip: {
      formatter: (p: { value?: unknown }) => {
        const [x, y, v] = (p.value ?? []) as [number, number, number | null];
        return `${escapar(eixoY[y])} · ${escapar(eixoX[x])}<br/>${escapar(serie)}: <b>${escapar(formatar(v, formato))}</b>`;
      },
    },
    xAxis: { type: 'category', data: eixoX, splitArea: { show: false }, axisLabel: { ...TEXTO, interval: eixoX.length > 12 ? 1 : 0 } },
    yAxis: { type: 'category', data: eixoY, inverse: true, axisLabel: TEXTO },
    visualMap: {
      min: valores.length ? Math.min(...valores) : 0,
      max: valores.length ? Math.max(...valores) : 1,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemHeight: 140,
      text: ['mais', 'menos'],
      textStyle: { color: CORES.textoSecundario, fontSize: 10 },
      formatter: (v: number) => compacto(v, formato),
      inRange: { color: rampaSequencial(paleta.destaque, 5) },
    },
    series: [{ type: 'heatmap', data: celulas, itemStyle: { borderColor: CORES.painel, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: CORES.texto } } }],
  };
}

/** Barras empilhadas (dimensão × dimensão2), cores na ordem da paleta; o que passa de 6 séries vira "Outros". */
export function opcoesEmpilhado(categorias: string[], series: Serie[], formato: Formato, paleta: PaletaTema, descricao: string): EChartsCoreOption {
  return {
    ...aria(descricao),
    ...legenda(series.map((s) => s.nome)),
    grid: GRID,
    tooltip: { ...tooltipEixo(formato), axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', axisLabel: { ...TEXTO, formatter: (v: number) => compacto(v, formato) } },
    yAxis: { type: 'category', data: categorias, inverse: true, axisLabel: { ...TEXTO, width: 130, overflow: 'truncate' } },
    series: series.map((s, i) => ({
      name: s.nome,
      type: 'bar',
      stack: 'e',
      barMaxWidth: 18,
      itemStyle: { color: s.nome === 'Outros' ? CORES.textoSecundario : paleta.categorica[i], borderColor: CORES.painel, borderWidth: 1 },
      data: s.valores,
    })),
  };
}

/** Dispersão com a cor do tema (uma série; o nome do ponto no tooltip). */
export function opcoesDispersaoTema(pontos: { nome: string; x: number | null; y: number | null }[], x: { rotulo: string; formato: Formato }, y: { rotulo: string; formato: Formato }, paleta: PaletaTema, descricao: string): EChartsCoreOption {
  const validos = pontos.filter((p) => p.x !== null && p.y !== null);
  return {
    ...aria(descricao),
    grid: { ...GRID, left: 16, top: 32, bottom: 24 },
    tooltip: {
      trigger: 'item',
      formatter: (p: { dataIndex?: number }) => {
        const pt = validos[p.dataIndex ?? -1];
        return pt ? `${escapar(pt.nome)}<br/>${escapar(x.rotulo)}: <b>${escapar(formatar(pt.x, x.formato))}</b><br/>${escapar(y.rotulo)}: <b>${escapar(formatar(pt.y, y.formato))}</b>` : '';
      },
    },
    xAxis: { type: 'value', scale: true, name: x.rotulo, nameLocation: 'middle', nameGap: 28, nameTextStyle: TEXTO, axisLabel: { ...TEXTO, formatter: (v: number) => compacto(v, x.formato) } },
    yAxis: { type: 'value', name: y.rotulo, nameTextStyle: TEXTO, scale: true, axisLabel: { ...TEXTO, formatter: (v: number) => compacto(v, y.formato) } },
    series: [
      {
        type: 'scatter',
        symbolSize: 12,
        itemStyle: { color: paleta.destaque, opacity: 0.85, borderColor: CORES.painel, borderWidth: 2 },
        label: { show: validos.length <= 8, position: 'right', color: CORES.textoSecundario, fontSize: 10, formatter: (p: { dataIndex?: number }) => validos[p.dataIndex ?? -1]?.nome ?? '' },
        data: validos.map((p) => [p.x, p.y]),
      },
    ],
  };
}
