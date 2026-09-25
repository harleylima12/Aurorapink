/**
 * Suíte de avaliação da Camada 0 (evals/perguntas.json). Grava evals/resultados/avaliacao-camada0.json.
 * Meta da Fase 3: pelo menos 60% no geral; 100% das fora de escopo recusadas.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { diferencas, type PerguntaAvaliacao } from '../../src/avaliacao/comparar';
import { criarRoteador, type Roteador } from '../../src/router/layer0';
import { semanticaOlist } from '../../src/semantic';
import suite from '../../evals/perguntas.json';
import { carregarValores } from './ajuda/valores';
import { RAIZ } from './ajuda/duckdbNode';

const perguntas = suite.perguntas as PerguntaAvaliacao[];
let roteador: Roteador;

beforeAll(async () => {
  roteador = criarRoteador(semanticaOlist, await carregarValores(), suite.ancora);
});

describe('suíte da Camada 0', () => {
  it('acerto por categoria', () => {
    const porId = new Map(perguntas.map((p) => [p.id, p]));
    const resultados = perguntas.map((p) => {
      const anterior = p.anterior ? roteador.rotear(porId.get(p.anterior)?.pergunta ?? '').spec : null;
      const t0 = performance.now();
      const r = roteador.rotear(p.pergunta, anterior);
      const ms = performance.now() - t0;
      const erros = diferencas(r.spec, p.esperado);
      return { id: p.id, categoria: p.categoria, pergunta: p.pergunta, ok: erros.length === 0, erros, confianca: r.confianca, ms, spec: r.spec };
    });
    const categorias = [...new Set(resultados.map((r) => r.categoria))];
    const resumo = Object.fromEntries(
      categorias.map((c) => {
        const daCategoria = resultados.filter((r) => r.categoria === c);
        return [c, { acertos: daCategoria.filter((r) => r.ok).length, total: daCategoria.length }];
      }),
    );
    const acertos = resultados.filter((r) => r.ok).length;
    const geral = acertos / resultados.length;
    const tempos = resultados.map((r) => r.ms).sort((a, b) => a - b);
    const saida = {
      geral: { acertos, total: resultados.length, taxa: geral },
      porCategoria: resumo,
      roteamentoMs: { p50: tempos[Math.floor(tempos.length / 2)], p95: tempos[Math.floor(tempos.length * 0.95)] },
      erros: resultados.filter((r) => !r.ok).map(({ id, pergunta, erros }) => ({ id, pergunta, erros })),
    };
    mkdirSync(path.join(RAIZ, 'evals', 'resultados'), { recursive: true });
    writeFileSync(path.join(RAIZ, 'evals', 'resultados', 'avaliacao-camada0.json'), `${JSON.stringify({ ...saida, resultados }, null, 2)}\n`);
    console.log(JSON.stringify(saida, null, 2));

    expect(geral).toBeGreaterThanOrEqual(0.6);
    expect(resumo.fora?.acertos).toBe(resumo.fora?.total);
  });
});
