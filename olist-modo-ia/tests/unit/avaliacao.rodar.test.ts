/**
 * O executor da página /avaliacao rodando a suíte inteira pelo caminho real (responder + DuckDB), em Node.
 * Camada 0 sozinha e Camada 0 + 1 com o motor falso (o modelo real só no PC).
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { criarMotorFalso } from '../../src/ai/motorFalso';
import type { PerguntaAvaliacao } from '../../src/avaliacao/comparar';
import { percentil, resumir, rodarSuite } from '../../src/avaliacao/rodar';
import type { ContextoResposta } from '../../src/modo-ia/responder';
import { criarRoteador, type Valores } from '../../src/router/layer0';
import { semanticaOlist } from '../../src/semantic';
import suite from '../../evals/perguntas.json';
import { abrirBancoTeste } from './ajuda/duckdbNode';
import { carregarValores } from './ajuda/valores';

const perguntas = suite.perguntas as PerguntaAvaliacao[];
let ctx: ContextoResposta;
let valores: Valores;

beforeAll(async () => {
  valores = await carregarValores();
  const banco = await abrirBancoTeste();
  ctx = {
    executor: { consultar: async (sql, params) => ({ linhas: banco.consultar(sql, params), ms: 0 }) },
    semantica: semanticaOlist,
    roteador: criarRoteador(semanticaOlist, valores, suite.ancora),
    mesesParciais: new Set(['2016-09-01', '2016-10-01', '2016-11-01', '2016-12-01', '2018-09-01']),
    ancora: suite.ancora,
  };
}, 60_000);

describe('executor da avaliação', () => {
  it('percentil e metas (funções puras)', () => {
    expect(percentil([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentil([], 0.95)).toBe(0);
    const r = resumir(
      [
        { id: 'a', categoria: 'facil', pergunta: 'x', ok: true, erros: [], modo: 'rapido', tipo: 'dados', ms: 10, spec: { intent: 'kpi', metrics: ['faturamento'], dimensions: [], filters: [] } },
        { id: 'b', categoria: 'fora', pergunta: 'y', ok: false, erros: ['intent'], modo: 'rapido', tipo: 'dados', ms: 20, spec: { intent: 'kpi', metrics: ['faturamento'], dimensions: [], filters: [] } },
      ],
      'camada0',
    );
    expect(r.metas.find((m) => m.nome === 'Fora de escopo recusadas')?.ok).toBe(false);
    expect(r.geral).toEqual({ acertos: 1, total: 2 });
  });

  it('Camada 0 pelo caminho real (SQL no DuckDB): mesmo acerto do roteador e todas as metas', async () => {
    const r = await rodarSuite(perguntas, ctx);
    expect(r.geral.total).toBe(102);
    expect(r.geral.acertos).toBe(102);
    expect(r.viaIA).toBe(0);
    expect(r.metas.every((m) => m.ok), JSON.stringify(r.metas)).toBe(true);
    expect(r.resultados.filter((x) => x.tipo === 'erro')).toEqual([]);
  }, 120_000);

  it('Camada 0 + 1 com o motor falso: narrador validado; com número inventado, 100% de fallback para o template', async () => {
    const r = await rodarSuite(perguntas.slice(0, 20), ctx, { ia: { motor: criarMotorFalso(), valores } });
    expect(r.modo).toBe('camada0+1');
    expect(r.fallbackNarrador?.tentados).toBeGreaterThan(10);
    expect(r.fallbackNarrador?.recusados).toBe(0);
    const ruim = await rodarSuite(perguntas.slice(0, 20), ctx, { ia: { motor: criarMotorFalso({ modo: 'narrador-com-numero' }), valores } });
    expect(ruim.fallbackNarrador?.recusados).toBe(ruim.fallbackNarrador?.tentados);
    // O texto recusado nunca muda o spec: o acerto é o mesmo.
    expect(ruim.geral.acertos).toBe(r.geral.acertos);
  }, 120_000);
});
