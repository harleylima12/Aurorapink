/**
 * Decomposição da variação ("por que caiu?"), função pura.
 *
 * Para uma métrica que soma (faturamento, pedidos...), a variação total entre dois períodos é
 * exatamente a soma das variações de cada segmento (categoria, estado...). Cada segmento
 * "contribui" com a sua parte do delta. Os maiores contribuintes, para cima e para baixo, explicam
 * a variação — com números, sem opinião.
 */

export interface Contribuicao {
  segmento: string;
  atual: number;
  anterior: number;
  delta: number;
  /** Parte do delta total explicada por este segmento (pode passar de 100% ou ser negativa). */
  parteDoDelta: number;
}

export interface Decomposicao {
  totalAtual: number;
  totalAnterior: number;
  delta: number;
  positivos: Contribuicao[];
  negativos: Contribuicao[];
  /** Soma dos segmentos fora do top 3 de cada lado. */
  outros: number;
  todos: Contribuicao[];
}

export function decompor(atual: ReadonlyMap<string, number>, anterior: ReadonlyMap<string, number>, top = 3): Decomposicao {
  const segmentos = new Set([...atual.keys(), ...anterior.keys()]);
  const totalAtual = [...atual.values()].reduce((s, v) => s + v, 0);
  const totalAnterior = [...anterior.values()].reduce((s, v) => s + v, 0);
  const delta = totalAtual - totalAnterior;
  const todos = [...segmentos]
    .map((segmento) => {
      const a = atual.get(segmento) ?? 0;
      const b = anterior.get(segmento) ?? 0;
      return { segmento, atual: a, anterior: b, delta: a - b, parteDoDelta: delta !== 0 ? (a - b) / delta : 0 };
    })
    .sort((x, y) => y.delta - x.delta || x.segmento.localeCompare(y.segmento));
  const positivos = todos.filter((c) => c.delta > 0).slice(0, top);
  const negativos = todos.filter((c) => c.delta < 0).reverse().slice(0, top);
  const explicado = [...positivos, ...negativos].reduce((s, c) => s + c.delta, 0);
  return { totalAtual, totalAnterior, delta, positivos, negativos, outros: delta - explicado, todos };
}
