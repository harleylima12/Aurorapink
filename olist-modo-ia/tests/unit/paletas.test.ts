/**
 * Fase 5C: paletas por tema conferidas por conta, não no olho (D64). Fundo do painel #131C31.
 */
import { describe, expect, it } from 'vitest';

import { contraste, distancia, oklab, PALETA_OLIST, PALETAS, rampaOrdinal, rampaSequencial } from '../../src/charts/paletas';
import { CORES } from '../../src/charts/tema';
import { TEMAS } from '../../src/universal/temas/definicoes';

const PAINEL = CORES.painel;

describe('paletas por tema', () => {
  it('a matemática bate com o validador de referência (#c98500 × #199e70: protan 8,4; normal 19,8)', () => {
    expect(distancia('#c98500', '#199e70', 'protan')).toBeCloseTo(8.4, 1);
    expect(distancia('#c98500', '#199e70')).toBeCloseTo(19.8, 1);
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it.each(TEMAS)('%s: contraste AA, vizinhas distinguíveis com daltonismo e longe do vermelho de alerta', (tema) => {
    const p = PALETAS[tema];
    // O destaque aparece em texto pequeno: 4,5:1. Marcas: 3:1.
    expect(contraste(p.destaque, PAINEL)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(p.destaque, CORES.fundo)).toBeGreaterThanOrEqual(4.5);
    for (const c of p.categorica) expect(contraste(c, PAINEL), c).toBeGreaterThanOrEqual(3);
    for (let i = 0; i + 1 < p.categorica.length; i++) {
      const [a, b] = [p.categorica[i]!, p.categorica[i + 1]!];
      expect(Math.min(distancia(a, b, 'protan'), distancia(a, b, 'deutan')), `${a}↔${b}`).toBeGreaterThanOrEqual(8);
      expect(distancia(a, b), `${a}↔${b}`).toBeGreaterThanOrEqual(15);
    }
    // Vermelho é só alerta. Ele só aparece em gráfico de UMA série, ao lado do destaque: esse par precisa de ≥ 15.
    // Categóricas nunca dividem gráfico com o vermelho (D64); mesmo assim ficam a ≥ 10 dele, e o alerta leva ícone/rótulo.
    expect(distancia(p.destaque, CORES.alerta), 'destaque × alerta').toBeGreaterThanOrEqual(15);
    for (const c of p.categorica) expect(distancia(c, CORES.alerta), `${c} × alerta`).toBeGreaterThanOrEqual(10);
    // Luminosidade do modo escuro (OKLCH L 0,48–0,67) e croma mínimo nas categóricas.
    for (const c of p.categorica) {
      const [L, a, b] = oklab(c);
      expect(L).toBeGreaterThanOrEqual(0.48);
      expect(L).toBeLessThanOrEqual(0.67);
      expect(Math.hypot(a, b)).toBeGreaterThanOrEqual(0.1);
    }
  });

  it('financeiro: entradas × saídas passam lado a lado', () => {
    const { entrada, saida } = PALETAS.financeiro;
    expect(Math.min(distancia(entrada!, saida!, 'protan'), distancia(entrada!, saida!, 'deutan'))).toBeGreaterThanOrEqual(8);
  });

  it('cada tema tem uma identidade diferente (destaques distintos entre si e da demo da Olist)', () => {
    const destaques = [...TEMAS.map((t) => PALETAS[t].destaque), PALETA_OLIST.destaque];
    expect(new Set(destaques).size).toBe(destaques.length);
    const primeiros = new Set(TEMAS.map((t) => PALETAS[t].categorica.join()));
    expect(primeiros.size).toBeGreaterThanOrEqual(7);
  });

  it('rampas: sequencial clareia até o destaque; ordinal escurece em passos ≥ 0,06 e o último ainda tem 2:1', () => {
    for (const t of TEMAS) {
      const seq = rampaSequencial(PALETAS[t].destaque, 5).map((c) => oklab(c)[0]);
      for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeGreaterThan(seq[i - 1]!);
      const ord = rampaOrdinal(PALETAS[t].destaque, 4);
      const L = ord.map((c) => oklab(c)[0]);
      for (let i = 1; i < L.length; i++) expect(L[i - 1]! - L[i]!).toBeGreaterThanOrEqual(0.059);
      expect(contraste(ord.at(-1)!, PAINEL), `${t} último passo`).toBeGreaterThanOrEqual(2);
    }
  });
});
