/**
 * Monta os gráficos próprios dos temas (Fase 5C) a partir das linhas que o DuckDB devolveu para o spec do visual.
 * Só organiza linhas e chama os construtores puros de src/charts/especiais.ts; medidor e lista de alerta são HTML.
 */
import type { EChartsCoreOption } from 'echarts/core';

import { funilAcumulado } from '../charts/contas';
import {
  opcoesAcumulado,
  opcoesBullet,
  opcoesCaixa,
  opcoesCascataFinanceira,
  opcoesDispersaoTema,
  opcoesEmpilhado,
  opcoesFunil,
  opcoesHeatmap,
  opcoesHistograma,
  opcoesLadoALado,
  opcoesMediaMovel,
  opcoesPareto,
  opcoesTreemap,
  type Serie,
} from '../charts/especiais';
import type { PaletaTema } from '../charts/paletas';
import { completarMeses } from '../charts/series';
import type { DefinicaoVisual } from '../dashboard/paginas';
import type { Linha } from '../data/duckdb';
import { formatar, rotuloPeriodo } from '../format/numeros';
import type { Dimensao, Semantica } from '../semantic/schema';

export type Especial =
  | { tipo: 'grafico'; opcoes: EChartsCoreOption; descricao: string; altura: number }
  | { tipo: 'medidor'; valor: number | null; rotulo: string; meta?: string; descricao: string }
  | { tipo: 'alerta'; itens: { nome: string; falta: number; atual: number | null; minimo: number | null }[]; descricao: string };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Ordem dos valores de uma dimensão: a fixa (dias, meses, horas, faixas) se existir; senão, a de chegada. */
function ordenar(valores: string[], dim: Dimensao | undefined): string[] {
  const unicos = [...new Set(valores)];
  const fixa = dim?.type === 'faixa' ? dim.buckets.map((b) => b.label) : dim?.type === 'categoria' ? dim.order : undefined;
  return fixa ? fixa.filter((v) => unicos.includes(v)) : unicos;
}

export function montarEspecial(def: DefinicaoVisual, linhas: Linha[], semantica: Semantica, paleta: PaletaTema): Especial | null {
  const [m, e1, e2] = def.spec.metrics;
  const [d1, d2] = def.spec.dimensions;
  const met = (id: string | undefined) => (id ? semantica.metrics[id] : undefined);
  const rot = (id: string | undefined) => met(id)?.label ?? id ?? '';
  const fmt = met(m)?.format ?? 'dec2';
  const altura = def.hero ? 360 : 300;
  const categorias = d1 ? linhas.map((l) => String(l[d1])) : [];
  const col = (id: string | undefined) => (id ? linhas.map((l) => num(l[id])) : []);
  const grafico = (opcoes: EChartsCoreOption, descricao: string, h = altura): Especial => ({ tipo: 'grafico', opcoes, descricao, altura: h });

  switch (def.forma) {
    case 'media_movel':
    case 'acumulado':
    case 'lado_a_lado': {
      if (d1 === 'tempo') {
        const metricas = [m, e1].filter((x): x is string => Boolean(x)).map((id) => ({ id, zeroQuandoVazio: met(id)?.empty_is_zero ?? false }));
        const cheias = completarMeses(linhas, 'tempo', metricas);
        const rotulos = cheias.map((l) => rotuloPeriodo(String(l.tempo), 'mes'));
        const serie = (id: string | undefined): Serie => ({ nome: rot(id), valores: cheias.map((l) => num(l[id ?? ''])) });
        const desc = `${def.titulo}, por mês, de ${rotulos[0] ?? ''} a ${rotulos.at(-1) ?? ''}.`;
        if (def.forma === 'media_movel') return grafico(opcoesMediaMovel(rotulos, serie(m), fmt, paleta, desc), desc);
        if (def.forma === 'acumulado') return grafico(opcoesAcumulado(rotulos, serie(m), fmt, paleta, desc), desc);
        const cores = paleta.entrada && paleta.saida ? [paleta.entrada, paleta.saida] : undefined;
        return grafico(opcoesLadoALado(rotulos, [serie(m), serie(e1)], fmt, paleta, desc, cores), desc);
      }
      const desc = `${def.titulo}: ${rot(m)} e ${rot(e1)} por ${semantica.dimensions[d1 ?? '']?.label.toLowerCase() ?? ''}.`;
      return grafico(opcoesLadoALado(categorias, [{ nome: rot(m), valores: col(m) }, { nome: rot(e1), valores: col(e1) }], fmt, paleta, desc), desc);
    }
    case 'pareto': {
      const desc = `Curva ABC: ${rot(m)} dos ${categorias.length} maiores, do maior para o menor, com a classe de cada um.`;
      return grafico(opcoesPareto(categorias, col(m), rot(m), fmt, paleta, desc), desc);
    }
    case 'treemap': {
      const desc = `Treemap: participação de cada ${semantica.dimensions[d1 ?? '']?.label.toLowerCase() ?? ''} em ${rot(m).toLowerCase()}.`;
      return grafico(opcoesTreemap(categorias, col(m), rot(m), fmt, paleta, desc), desc);
    }
    case 'funil_etapas': {
      const ordem = def.extra?.etapas ?? [];
      const etapas = funilAcumulado(linhas.map((l) => ({ valor: String(l[d1 ?? '']), n: num(l[m ?? '']) ?? 0 })), ordem);
      const desc = `Funil: ${etapas.map((e) => `${e.etapa} ${formatar(e.n, 'int')}`).join(', ')}.`;
      return grafico(opcoesFunil(etapas, 'int', paleta, desc), desc, Math.max(220, etapas.length * 56));
    }
    case 'funil_metricas': {
      const l = linhas[0] ?? {};
      const etapas = [m, e1, e2].filter((x): x is string => Boolean(x)).map((id) => ({ etapa: rot(id), n: num(l[id]) }));
      const desc = `Funil: ${etapas.map((e) => `${e.etapa} ${formatar(e.n, 'int')}`).join(', ')}.`;
      return grafico(opcoesFunil(etapas, 'int', paleta, desc), desc, 240);
    }
    case 'cascata': {
      const l = linhas[0] ?? {};
      const [ent, sai, sal] = [num(l[m ?? '']) ?? 0, num(l[e1 ?? '']) ?? 0, num(l[e2 ?? '']) ?? 0];
      const desc = `Entradas ${formatar(ent, 'brl')}, saídas ${formatar(sai, 'brl')}, saldo ${formatar(sal, 'brl')}.`;
      return grafico(opcoesCascataFinanceira(ent, sai, sal, paleta, desc), desc);
    }
    case 'histograma': {
      const ordem = ordenar(categorias, semantica.dimensions[d1 ?? '']);
      const valores = ordem.map((c) => num(linhas.find((l) => String(l[d1 ?? '']) === c)?.[m ?? '']));
      const desc = `Histograma de ${semantica.dimensions[d1 ?? '']?.label.toLowerCase() ?? ''}: ${ordem.length} faixas.`;
      return grafico(opcoesHistograma(ordem, valores, paleta, desc), desc);
    }
    case 'caixa': {
      const desc = `Mediana e faixa do meio (p25 a p75) de ${rot(m).toLowerCase()} por ${semantica.dimensions[d1 ?? '']?.label.toLowerCase() ?? ''}.`;
      return grafico(opcoesCaixa(categorias, col(e1), col(m), col(e2), fmt, paleta, desc), desc, Math.max(220, categorias.length * 34 + 40));
    }
    case 'bullet': {
      const desc = `Estoque atual e mínimo dos ${categorias.length} itens com maior falta.`;
      return grafico(opcoesBullet(categorias, col(e1), col(e2), paleta, desc), desc, Math.max(240, categorias.length * 28 + 60));
    }
    case 'tabela_alerta': {
      const itens = linhas
        .map((l) => ({ nome: String(l[d1 ?? '']), falta: num(l[m ?? '']) ?? 0, atual: num(l[e1 ?? '']), minimo: num(l[e2 ?? '']) }))
        .filter((x) => x.falta > 0);
      return { tipo: 'alerta', itens, descricao: `${itens.length} itens abaixo do mínimo.` };
    }
    case 'dispersao': {
      const desc = `Dispersão: ${rot(m)} (horizontal) e ${rot(e1)} (vertical), um ponto por ${semantica.dimensions[d1 ?? '']?.label.toLowerCase() ?? ''}.`;
      const pontos = linhas.map((l) => ({ nome: String(l[d1 ?? '']), x: num(l[m ?? '']), y: num(l[e1 ?? '']) }));
      return grafico(opcoesDispersaoTema(pontos, { rotulo: rot(m), formato: fmt }, { rotulo: rot(e1), formato: met(e1)?.format ?? 'dec2' }, paleta, desc), desc);
    }
    case 'heatmap':
    case 'heatmap_semana_hora':
    case 'heatmap_semana_mes': {
      const ys = ordenar(categorias, semantica.dimensions[d1 ?? '']);
      const xs = ordenar(linhas.map((l) => String(l[d2 ?? ''])), semantica.dimensions[d2 ?? '']);
      const celulas = linhas.map((l): [number, number, number | null] => [xs.indexOf(String(l[d2 ?? ''])), ys.indexOf(String(l[d1 ?? ''])), num(l[m ?? ''])]);
      const desc = `Mapa de calor de ${rot(m).toLowerCase()}: ${semantica.dimensions[d1 ?? '']?.label.toLowerCase()} × ${semantica.dimensions[d2 ?? '']?.label.toLowerCase()}. Mais claro = mais.`;
      return grafico(opcoesHeatmap(xs, ys, celulas, rot(m), fmt, paleta, desc), desc, Math.max(240, ys.length * 34 + 90));
    }
    case 'empilhado': {
      // Categorias: as 10 com mais total; séries: as 5 maiores da 2ª dimensão + "Outros" (soma das demais).
      const total = (chave: string, v: string) => linhas.filter((l) => String(l[chave]) === v).reduce((s, l) => s + (num(l[m ?? '']) ?? 0), 0);
      const cats = [...new Set(categorias)].sort((a, b) => total(d1 ?? '', b) - total(d1 ?? '', a)).slice(0, 10);
      const todas = [...new Set(linhas.map((l) => String(l[d2 ?? ''])))].sort((a, b) => total(d2 ?? '', b) - total(d2 ?? '', a));
      const principais = todas.slice(0, 5);
      const valor = (c: string, s: string) => num(linhas.find((l) => String(l[d1 ?? '']) === c && String(l[d2 ?? '']) === s)?.[m ?? '']);
      const series: Serie[] = principais.map((s) => ({ nome: s, valores: cats.map((c) => valor(c, s)) }));
      if (todas.length > 5) series.push({ nome: 'Outros', valores: cats.map((c) => todas.slice(5).reduce((t, s) => t + (valor(c, s) ?? 0), 0)) });
      const desc = `Barras empilhadas: ${rot(m).toLowerCase()} por ${semantica.dimensions[d1 ?? '']?.label.toLowerCase()}, dividido por ${semantica.dimensions[d2 ?? '']?.label.toLowerCase()}.`;
      return grafico(opcoesEmpilhado(cats, series, fmt, paleta, desc), desc, Math.max(260, cats.length * 32 + 80));
    }
    case 'medidor': {
      const v = num(linhas[0]?.[m ?? '']);
      return { tipo: 'medidor', valor: v, rotulo: rot(m), meta: def.extra?.meta, descricao: `${rot(m)}: ${formatar(v, 'pct')}.` };
    }
    default:
      return null;
  }
}
