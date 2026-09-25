/**
 * Seletor de gráfico por regras (seção 12), não por IA. Função pura.
 * - 1 valor -> cartão KPI; tempo -> linha; ranking -> barras horizontais (máx. 15 + "Outros");
 * - comparação de 2 a 5 grupos -> colunas; distribuição -> histograma (colunas);
 * - 2 métricas × 1 dimensão -> dispersão; explicar_variacao -> cascata; 2 dimensões -> tabela.
 */
import type { EChartsCoreOption } from 'echarts/core';

import type { Linha } from '../data/duckdb';
import { formatar, rotuloPeriodo } from '../format/numeros';
import { decompor } from '../insights/drivers';
import type { QuerySpec } from '../query/spec';
import type { Semantica } from '../semantic/schema';
import { opcoesBarras, opcoesCascata, opcoesDispersao, opcoesLinha } from './opcoes';
import { completarMeses, faixasParciais } from './series';

export type TipoGrafico = 'kpi' | 'linha' | 'barra' | 'coluna' | 'dispersao' | 'cascata' | 'tabela';

export interface SelecaoGrafico {
  tipo: TipoGrafico;
  opcoes?: EChartsCoreOption;
  descricao: string;
}

export interface EntradaGrafico {
  spec: QuerySpec;
  semantica: Semantica;
  linhas: Linha[];
  total?: number | null;
  anteriorPorSegmento?: Linha[] | null;
  mesesParciais?: ReadonlySet<string>;
  rotulosPeriodo?: { atual: string; anterior: string };
}

const MAX_BARRAS = 15;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function selecionarGrafico(e: EntradaGrafico): SelecaoGrafico {
  const { spec, semantica, linhas } = e;
  const [idM, idM2] = spec.metrics;
  const metrica = idM ? semantica.metrics[idM] : undefined;
  const [dim] = spec.dimensions;
  if (!metrica || !idM) return { tipo: 'tabela', descricao: 'Tabela de dados.' };
  if (!dim) return { tipo: 'kpi', descricao: `Cartão: ${metrica.label}.` };
  if (spec.dimensions.length > 1) return { tipo: 'tabela', descricao: `Tabela: ${metrica.label} por ${spec.dimensions.join(' e ')}.` };
  const dimLabel = semantica.dimensions[dim]?.label.toLowerCase() ?? dim;

  if (spec.intent === 'explicar_variacao' && e.anteriorPorSegmento) {
    const mapa = (ls: Linha[]) => new Map(ls.map((l) => [String(l[dim]), num(l[idM]) ?? 0]));
    const d = decompor(mapa(linhas), mapa(e.anteriorPorSegmento));
    // Legível num cartão estreito: os 3 que mais empurraram na direção da variação + 1 na contrária.
    const principais = d.delta < 0 ? d.negativos : d.positivos;
    const contrarios = (d.delta < 0 ? d.positivos : d.negativos).slice(0, 1);
    const escolhidos = [...principais, ...contrarios];
    const passos = escolhidos.map((c) => ({ rotulo: c.segmento, delta: c.delta }));
    const explicado = escolhidos.reduce((s, c) => s + c.delta, 0);
    d.outros = d.delta - explicado;
    if (Math.abs(d.outros) > 1e-9) passos.push({ rotulo: 'Outros', delta: d.outros });
    const descricao = `Cascata: ${metrica.label} de ${e.rotulosPeriodo?.anterior ?? 'antes'} para ${e.rotulosPeriodo?.atual ?? 'depois'}, por ${dimLabel}.`;
    return {
      tipo: 'cascata',
      descricao,
      opcoes: opcoesCascata({
        inicio: { rotulo: e.rotulosPeriodo?.anterior ?? 'Antes', valor: d.totalAnterior },
        passos,
        fim: { rotulo: e.rotulosPeriodo?.atual ?? 'Depois', valor: d.totalAtual },
        formato: metrica.format,
        descricao,
      }),
    };
  }

  if (dim === 'tempo') {
    const grao = spec.time?.grain ?? 'mes';
    const ls = grao === 'mes' ? completarMeses(linhas, 'tempo', spec.metrics.map((id) => ({ id, zeroQuandoVazio: semantica.metrics[id]?.empty_is_zero ?? false }))) : linhas;
    const eixo = ls.map((l) => String(l.tempo));
    const rotulos = eixo.map((p) => rotuloPeriodo(p, grao));
    const faixas = grao === 'mes' && e.mesesParciais ? faixasParciais(eixo, e.mesesParciais).map(([a, b]): [string, string] => [rotuloPeriodo(a, grao), rotuloPeriodo(b, grao)]) : [];
    const descricao = `Gráfico de linha: ${metrica.label} de ${rotulos[0] ?? ''} a ${rotulos.at(-1) ?? ''}.`;
    return {
      tipo: 'linha',
      descricao,
      opcoes: opcoesLinha({
        rotulos,
        series: [{ nome: metrica.label, valores: ls.map((l) => num(l[idM])) }],
        formato: metrica.format,
        descricao,
        faixasParciais: faixas,
        alerta: idM === 'pct_atraso',
      }),
    };
  }

  const metrica2 = idM2 ? semantica.metrics[idM2] : undefined;
  if (metrica2 && idM2) {
    const descricao = `Dispersão: ${metrica.label} × ${metrica2.label}, um ponto por ${dimLabel}.`;
    return {
      tipo: 'dispersao',
      descricao,
      opcoes: opcoesDispersao({
        pontos: linhas.map((l) => ({ nome: String(l[dim]), x: num(l[idM]), y: num(l[idM2]) })),
        x: { rotulo: metrica.label, formato: metrica.format },
        y: { rotulo: metrica2.label, formato: metrica2.format },
        descricao,
      }),
    };
  }

  let categorias = linhas.map((l) => String(l[dim]));
  let valores = linhas.map((l) => num(l[idM]));
  const horizontal = spec.intent === 'ranking' || (spec.intent === 'comparacao' && linhas.length > 5);
  const cortado = categorias.length > MAX_BARRAS;
  if (cortado) {
    categorias = categorias.slice(0, MAX_BARRAS);
    valores = valores.slice(0, MAX_BARRAS);
  }
  // "Outros" só quando a lista foi CORTADA nas 15 barras (num "top 5" pedido, ele esmagaria o gráfico).
  const soma = valores.reduce<number>((s, v) => s + (v ?? 0), 0);
  if (cortado && metrica.empty_is_zero && e.total && e.total - soma > e.total * 0.001 && spec.sort?.dir !== 'asc') {
    categorias = [...categorias, 'Outros'];
    valores = [...valores, e.total - soma];
  }
  const alertas = new Set(dim === 'status_entrega' ? ['Atrasado'] : []);
  const [primeira] = categorias;
  const descricao = `Gráfico de barras: ${metrica.label} por ${dimLabel}. ${primeira ? `Primeiro: ${primeira}, ${formatar(valores[0] ?? null, metrica.format)}.` : ''}`;
  return {
    tipo: horizontal ? 'barra' : 'coluna',
    descricao,
    opcoes: opcoesBarras({ categorias, valores, formato: metrica.format, serie: metrica.label, descricao, horizontal, alertas }),
  };
}
