/** Fase 5C: contas dos gráficos por tema e forma das opções do ECharts (sem abrir navegador). */
import { describe, expect, it } from 'vitest';

import { classesAbc, etapasDoStatus, faixasHistograma, funilAcumulado, mediaMovel, somaCorrida } from '../../src/charts/contas';
import { opcoesBullet, opcoesCascataFinanceira, opcoesHeatmap, opcoesPareto } from '../../src/charts/especiais';
import { PALETAS } from '../../src/charts/paletas';
import { CORES } from '../../src/charts/tema';

describe('contas dos gráficos', () => {
  it('curva ABC: classe pelo acumulado ANTES do item (A até 80%, B até 95%)', () => {
    const r = classesAbc([50, 30, 10, 5, 3, 2]);
    expect(r.map((x) => x.classe)).toEqual(['A', 'A', 'B', 'B', 'C', 'C']);
    expect(r.at(-1)?.acumulado).toBeCloseTo(1, 10);
  });

  it('média móvel de 3 e soma corrida', () => {
    expect(mediaMovel([3, 6, 9, 12])).toEqual([null, null, 6, 9]);
    expect(mediaMovel([3, null, 9, 12])).toEqual([null, null, null, null]);
    expect(somaCorrida([10, -4, null, 5])).toEqual([10, 6, 6, 11]);
  });

  it('funil: só com 3+ etapas conhecidas; cancelado fica fora; quem chegou adiante conta nas etapas de trás', () => {
    expect(etapasDoStatus(['Enviado', 'Entregue', 'Cancelado'])).toBeNull();
    const e = etapasDoStatus(['Entregue', 'Orçamento', 'Aprovado', 'Em desenvolvimento', 'Cancelado'])!;
    expect(e.ordem).toEqual(['Orçamento', 'Aprovado', 'Em desenvolvimento', 'Entregue']);
    expect(e.fora).toEqual(['Cancelado']);
    const f = funilAcumulado(
      [
        { valor: 'Orçamento', n: 10 },
        { valor: 'Aprovado', n: 5 },
        { valor: 'Em desenvolvimento', n: 3 },
        { valor: 'Entregue', n: 2 },
        { valor: 'Cancelado', n: 4 },
      ],
      e.ordem,
    );
    expect(f.map((x) => x.n)).toEqual([20, 10, 5, 2]);
  });

  it('faixas de histograma redondas, a última aberta', () => {
    const f = faixasHistograma(2100, 13900, 'brl');
    expect(f.length).toBeGreaterThanOrEqual(5);
    expect(f.at(-1)?.max).toBeNull();
    const maxs = f.slice(0, -1).map((x) => x.max!);
    expect(maxs.every((m, i) => i === 0 || m > maxs[i - 1]!)).toBe(true);
    expect(new Set(maxs.slice(1).map((m, i) => m - maxs[i]!)).size).toBe(1);
    expect(faixasHistograma(5, 5, 'int')).toEqual([]);
  });
});

describe('opções por tema', () => {
  const texto = (o: unknown) => JSON.stringify(o);
  it('vermelho só no alerta: cascata com saldo positivo não tem vermelho; negativo tem', () => {
    const p = PALETAS.financeiro;
    expect(texto(opcoesCascataFinanceira(100, 60, 40, p, 'x'))).not.toContain(CORES.alerta);
    expect(texto(opcoesCascataFinanceira(60, 100, -40, p, 'x'))).toContain(CORES.alerta);
    expect(texto(opcoesCascataFinanceira(100, 60, 40, p, 'x'))).toContain(p.entrada!);
  });

  it('bullet: item abaixo do mínimo em vermelho, os outros na cor do tema', () => {
    const o = opcoesBullet(['a', 'b'], [3, 90], [10, 20], PALETAS.estoque, 'x') as { series: { data: { itemStyle: { color: string } }[] }[] };
    expect(o.series[0]!.data.map((d) => d.itemStyle.color)).toEqual([CORES.alerta, PALETAS.estoque.destaque]);
  });

  it('um eixo só (nunca dois) e aria ligada', () => {
    for (const o of [opcoesPareto(['a', 'b'], [2, 1], 'F', 'brl', PALETAS.vendas, 'd'), opcoesHeatmap(['x'], ['y'], [[0, 0, 1]], 'F', 'int', PALETAS.atendimento, 'd')]) {
      const r = o as { yAxis: unknown; aria: { enabled: boolean } };
      expect(Array.isArray(r.yAxis)).toBe(false);
      expect(r.aria.enabled).toBe(true);
    }
  });

  it('tooltip escapa o texto dos dados (célula com HTML não vira código)', () => {
    const o = opcoesPareto(['<img src=x onerror=alert(1)>'], [1], 'F', 'brl', PALETAS.vendas, 'd') as { tooltip: { formatter: (p: unknown) => string } };
    expect(o.tooltip.formatter({ name: '<img src=x onerror=alert(1)>', value: 1, dataIndex: 0 })).not.toContain('<img');
  });
});
