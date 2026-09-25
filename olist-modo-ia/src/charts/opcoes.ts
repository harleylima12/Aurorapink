/**
 * Opções do ECharts montadas por funções puras (testadas em tests/unit/graficos.test.ts).
 *
 * Segurança: o tooltip do ECharts é montado em HTML. Todo texto que vem dos dados
 * (nomes de categoria, cidade...) passa por `format.encodeHTML` antes de entrar
 * nele. No Modo Universal, uma célula com "<img onerror=...>" vira texto, não código.
 */
import { format, type EChartsCoreOption } from 'echarts/core';

import { formatar } from '../format/numeros';
import type { Formato } from '../semantic/schema';
import { CORES, GRADIENTE_HORIZONTAL, GRADIENTE_VERTICAL } from './tema';

export const escapar = (texto: unknown): string => format.encodeHTML(String(texto ?? ''));

interface ItemTooltip {
  name?: unknown;
  seriesName?: unknown;
  value?: unknown;
  marker?: unknown;
  axisValueLabel?: unknown;
  dataIndex?: unknown;
}

function comoLista(params: unknown): ItemTooltip[] {
  const lista = Array.isArray(params) ? params : [params];
  return lista.filter((p): p is ItemTooltip => typeof p === 'object' && p !== null);
}

function numero(valor: unknown): number | null {
  if (Array.isArray(valor)) return numero(valor.at(-1));
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

const GRID = { left: 8, right: 16, top: 16, bottom: 8, containLabel: true };
const TEXTO_EIXO = { color: CORES.textoSecundario, fontSize: 11 };

export interface SerieLinha {
  nome: string;
  valores: (number | null)[];
}

export interface EntradaLinha {
  rotulos: string[];
  series: SerieLinha[];
  formato: Formato;
  descricao: string;
  /** Pares [rótulo inicial, rótulo final] sombreados como "poucos dados". */
  faixasParciais?: [string, string][];
  alerta?: boolean;
}

export function opcoesLinha(entrada: EntradaLinha): EChartsCoreOption {
  const cor = entrada.alerta ? CORES.alerta : CORES.destaque;
  const parciais = entrada.faixasParciais ?? [];
  return {
    aria: { enabled: true, label: { description: entrada.descricao } },
    grid: GRID,
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const itens = comoLista(params);
        const titulo = escapar(itens[0]?.axisValueLabel ?? itens[0]?.name);
        const linhas = itens.map(
          (i) => `${String(i.marker ?? '')}${escapar(i.seriesName)}: <b>${escapar(formatar(numero(i.value), entrada.formato))}</b>`,
        );
        return [titulo, ...linhas].join('<br/>');
      },
    },
    // Com bandas (boundaryGap), um único mês sombreado também tem largura.
    xAxis: { type: 'category', data: entrada.rotulos, boundaryGap: true, axisLabel: TEXTO_EIXO },
    yAxis: {
      type: 'value',
      axisLabel: { ...TEXTO_EIXO, formatter: (v: number) => formatar(v, entrada.formato, { compacto: true }) },
    },
    series: entrada.series.map((serie, i) => ({
      name: serie.nome,
      type: 'line',
      data: serie.valores,
      smooth: 0.3,
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: 2.5, color: i === 0 ? cor : CORES.roxo },
      itemStyle: { color: i === 0 ? cor : CORES.roxo },
      areaStyle:
        i === 0
          ? {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: `${cor}55` },
                  { offset: 1, color: `${cor}00` },
                ],
              },
            }
          : undefined,
      markArea:
        i === 0 && parciais.length
          ? {
              silent: true,
              itemStyle: { color: 'rgba(148, 163, 184, 0.08)' },
              label: { color: CORES.textoSecundario, fontSize: 10, position: 'insideTop' },
              data: parciais.map(([de, ate]) => [{ xAxis: de, name: 'poucos pedidos' }, { xAxis: ate }]),
            }
          : undefined,
    })),
  };
}

export interface EntradaBarras {
  categorias: string[];
  valores: (number | null)[];
  formato: Formato;
  serie: string;
  descricao: string;
  horizontal: boolean;
  /** Categorias pintadas de vermelho (atraso/negativo). */
  alertas?: ReadonlySet<string>;
}

export function opcoesBarras(entrada: EntradaBarras): EChartsCoreOption {
  const eixoCategoria = {
    type: 'category',
    data: entrada.categorias,
    inverse: entrada.horizontal,
    axisLabel: { ...TEXTO_EIXO, width: entrada.horizontal ? 150 : 90, overflow: 'truncate', interval: 0 },
  };
  const eixoValor = {
    type: 'value',
    axisLabel: { ...TEXTO_EIXO, formatter: (v: number) => formatar(v, entrada.formato, { compacto: true }) },
  };
  const gradiente = entrada.horizontal ? GRADIENTE_HORIZONTAL : GRADIENTE_VERTICAL;
  return {
    aria: { enabled: true, label: { description: entrada.descricao } },
    grid: { ...GRID, right: 56 },
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const [item] = comoLista(params);
        return `${escapar(item?.name)}<br/>${escapar(entrada.serie)}: <b>${escapar(formatar(numero(item?.value), entrada.formato))}</b>`;
      },
    },
    xAxis: entrada.horizontal ? eixoValor : eixoCategoria,
    yAxis: entrada.horizontal ? eixoCategoria : eixoValor,
    series: [
      {
        name: entrada.serie,
        type: 'bar',
        barMaxWidth: entrada.horizontal ? 18 : 48,
        data: entrada.valores.map((valor, i) => ({
          value: valor,
          itemStyle: {
            color: entrada.alertas?.has(entrada.categorias[i] ?? '') ? CORES.alerta : gradiente,
            borderRadius: entrada.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
          },
        })),
        label: {
          show: true,
          position: entrada.horizontal ? 'right' : 'top',
          color: CORES.texto,
          fontSize: 11,
          formatter: (p: { value?: unknown }) => formatar(numero(p.value), entrada.formato, { compacto: true }),
        },
      },
    ],
  };
}

export interface PontoDispersao {
  nome: string;
  x: number | null;
  y: number | null;
}

export interface EntradaDispersao {
  pontos: PontoDispersao[];
  x: { rotulo: string; formato: Formato };
  y: { rotulo: string; formato: Formato };
  descricao: string;
}

export function opcoesDispersao(entrada: EntradaDispersao): EChartsCoreOption {
  const validos = entrada.pontos.filter((p) => p.x !== null && p.y !== null);
  return {
    aria: { enabled: true, label: { description: entrada.descricao } },
    grid: { ...GRID, left: 16, top: 32, bottom: 24 },
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const [item] = comoLista(params);
        const ponto = validos[typeof item?.dataIndex === 'number' ? item.dataIndex : -1];
        if (!ponto) return '';
        return (
          `${escapar(ponto.nome)}<br/>${escapar(entrada.x.rotulo)}: <b>${escapar(formatar(ponto.x, entrada.x.formato))}</b>` +
          `<br/>${escapar(entrada.y.rotulo)}: <b>${escapar(formatar(ponto.y, entrada.y.formato))}</b>`
        );
      },
    },
    xAxis: {
      type: 'value',
      name: entrada.x.rotulo,
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: TEXTO_EIXO,
      axisLabel: { ...TEXTO_EIXO, formatter: (v: number) => formatar(v, entrada.x.formato, { compacto: true }) },
    },
    yAxis: {
      type: 'value',
      name: entrada.y.rotulo,
      nameTextStyle: TEXTO_EIXO,
      scale: true,
      axisLabel: { ...TEXTO_EIXO, formatter: (v: number) => formatar(v, entrada.y.formato, { compacto: true }) },
    },
    series: [
      {
        type: 'scatter',
        symbolSize: 11,
        itemStyle: { color: CORES.destaque, opacity: 0.8, borderColor: CORES.roxo },
        data: validos.map((p) => [p.x, p.y]),
      },
    ],
  };
}

export interface EntradaCascata {
  inicio: { rotulo: string; valor: number };
  passos: { rotulo: string; delta: number }[];
  fim: { rotulo: string; valor: number };
  formato: Formato;
  descricao: string;
}

/** Cascata (ponte) da variação: barra invisível de base + barra visível do delta de cada segmento. */
export function opcoesCascata(entrada: EntradaCascata): EChartsCoreOption {
  const categorias = [entrada.inicio.rotulo, ...entrada.passos.map((p) => p.rotulo), entrada.fim.rotulo];
  const base: number[] = [0];
  const visivel: { value: number; itemStyle: { color: unknown } }[] = [{ value: entrada.inicio.valor, itemStyle: { color: CORES.roxo } }];
  const deltas: (number | null)[] = [null];
  let nivel = entrada.inicio.valor;
  for (const p of entrada.passos) {
    const fim = nivel + p.delta;
    base.push(Math.min(nivel, fim));
    visivel.push({ value: Math.abs(p.delta), itemStyle: { color: p.delta < 0 ? CORES.alerta : CORES.destaque } });
    deltas.push(p.delta);
    nivel = fim;
  }
  base.push(0);
  visivel.push({ value: entrada.fim.valor, itemStyle: { color: CORES.roxo } });
  const niveis = [entrada.inicio.valor, entrada.fim.valor, ...base.slice(1, -1)];
  const menor = Math.min(...niveis);
  const maior = Math.max(entrada.inicio.valor, entrada.fim.valor);
  const piso = menor > 0 ? Math.max(0, menor - (maior - menor) * 0.6) : undefined;
  deltas.push(null);
  const rotuloDe = (i: number) => {
    const d = deltas[i];
    if (d === null || d === undefined) return formatar(visivel[i]?.value ?? null, entrada.formato, { compacto: true });
    const texto = formatar(d, entrada.formato, { compacto: true });
    return d > 0 ? `+${texto}` : texto;
  };
  return {
    aria: { enabled: true, label: { description: entrada.descricao } },
    grid: { ...GRID, top: 24 },
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const [item] = comoLista(params);
        const i = typeof item?.dataIndex === 'number' ? item.dataIndex : 0;
        return `${escapar(categorias[i])}: <b>${escapar(rotuloDe(i))}</b>`;
      },
    },
    xAxis: { type: 'category', data: categorias, axisLabel: { ...TEXTO_EIXO, interval: 0, rotate: 30, width: 90, overflow: 'truncate' } },
    // Eixo começa perto dos valores (não no zero): senão as variações somem ao lado dos totais.
    yAxis: { type: 'value', min: piso, axisLabel: { ...TEXTO_EIXO, formatter: (v: number) => formatar(v, entrada.formato, { compacto: true }) } },
    series: [
      { type: 'bar', stack: 'cascata', silent: true, itemStyle: { color: 'transparent' }, data: base, tooltip: { show: false } },
      {
        type: 'bar',
        stack: 'cascata',
        data: visivel,
        barMaxWidth: 44,
        label: { show: true, position: 'top', color: CORES.texto, fontSize: 10, formatter: (p: { dataIndex?: number }) => rotuloDe(p.dataIndex ?? 0) },
      },
    ],
  };
}
