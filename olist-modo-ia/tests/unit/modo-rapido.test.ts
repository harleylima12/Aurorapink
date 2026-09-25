/**
 * Modo Rápido de ponta a ponta (sem navegador): pergunta -> Camada 0 -> SQL -> DuckDB-WASM -> fatos -> texto.
 * Confere números contra o Power BI / validacao.md, e que nenhum texto cita número fora dos fatos.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { decompor } from '../../src/insights/drivers';
import { correlacao, gerarFatos, inclinacao, outliers } from '../../src/insights/engine';
import { responder, type ContextoResposta, type Resposta } from '../../src/modo-ia/responder';
import { numerosNaoRastreaveis } from '../../src/narrator/validador';
import { criarRoteador } from '../../src/router/layer0';
import { semanticaOlist } from '../../src/semantic';
import suite from '../../evals/perguntas.json';
import { abrirBancoTeste } from './ajuda/duckdbNode';
import { carregarValores } from './ajuda/valores';

let ctx: ContextoResposta;
const PARCIAIS = new Set(['2016-09-01', '2016-10-01', '2016-11-01', '2016-12-01', '2018-09-01']);

beforeAll(async () => {
  const banco = await abrirBancoTeste();
  ctx = {
    executor: { consultar: async (sql, params) => ({ linhas: banco.consultar(sql, params), ms: 0 }) },
    semantica: semanticaOlist,
    roteador: criarRoteador(semanticaOlist, await carregarValores(), '2018-08-31'),
    mesesParciais: PARCIAIS,
    ancora: '2018-08-31',
  };
});

const texto = (r: Resposta) => [r.texto.titulo, ...r.texto.bullets].join(' ');
const limpo = (t: string) => t.replace(/[  ]/g, ' ');

describe('respostas do Modo Rápido', () => {
  it('KPI: faturamento total = Power BI', async () => {
    const r = await responder('quanto faturamos no total?', ctx);
    expect(r.tipo).toBe('dados');
    expect(r.grafico?.tipo).toBe('kpi');
    expect(limpo(r.texto.bullets[0] ?? '')).toBe('Faturamento: R$ 13.494.400,74.');
  });

  it('ranking com participação, top 3 e "Outros"', async () => {
    const r = await responder('top 5 categorias em 2018', ctx);
    expect(r.grafico?.tipo).toBe('barra');
    expect(r.consultas.map((c) => c.rotulo)).toEqual(['resposta', 'total (para a participação)']);
    expect(limpo(texto(r))).toMatch(/lidera: R\$ [\d.,]+ \([\d,]+% do total\)/);
    expect(r.linhas).toHaveLength(5);
  });

  it('comparação: atraso derruba a nota (diferença entre grupos)', async () => {
    const r = await responder('nota de quem recebeu atrasado vs no prazo', ctx);
    expect(r.grafico?.tipo).toBe('coluna');
    expect(r.linhas.map((l) => l.status_entrega)).toEqual(['No Prazo', 'Atrasado']);
    expect(limpo(texto(r))).toContain('Maior: No Prazo (4,29). Menor: Atrasado (2,27).');
  });

  it('tendência ignora meses com poucos pedidos no pico', async () => {
    const r = await responder('faturamento mês a mês', ctx);
    expect(r.grafico?.tipo).toBe('linha');
    expect(limpo(texto(r))).toContain('Pico em nov/2017');
    expect(texto(r)).toContain('Meses com poucos pedidos');
  });

  it('por que caiu em dezembro de 2017: decomposição por categoria e cascata', async () => {
    const r = await responder('por que o faturamento caiu em dezembro de 2017?', ctx);
    expect(r.grafico?.tipo).toBe('cascata');
    expect(r.consultas).toHaveLength(2);
    expect(limpo(texto(r))).toMatch(/Faturamento: variação de -[\d,]+% \(-R\$ [\d.,]+\)/);
    expect(texto(r)).toContain('Quem mais pesou:');
    expect(r.rotuloPeriodo).toBe('dez/2017 vs nov/2017');
  });

  it('KPI com comparação ano contra ano', async () => {
    const r = await responder('faturamento de 2018 vs ano anterior', ctx);
    expect(r.consultas).toHaveLength(2);
    expect(r.fatos.find((f) => f.id === 'variacao_pct')).toBeDefined();
  });

  it('fora de escopo e esclarecimento não rodam SQL', async () => {
    const fora = await responder('qual o lucro por categoria?', ctx);
    expect(fora.tipo).toBe('fora_de_escopo');
    expect(fora.consultas).toHaveLength(0);
    expect(fora.texto.bullets[0]).toContain('custo');
    const vaga = await responder('como estamos?', ctx);
    expect(vaga.tipo).toBe('esclarecer');
    expect(vaga.sugestoes).toHaveLength(3);
  });

  it('follow-up: "e só em SP?" reaproveita a pergunta anterior', async () => {
    const primeira = await responder('top 5 categorias em 2018', ctx);
    const segunda = await responder('e só em SP?', ctx, primeira.spec);
    expect(segunda.spec.filters).toEqual([{ dimension: 'estado_cliente', op: 'in', values: ['SP'] }]);
    expect(segunda.linhas).toHaveLength(5);
  });

  it('ZERO números fora dos fatos em TODAS as respostas da suíte', async () => {
    const problemas: string[] = [];
    for (const p of suite.perguntas) {
      const r = await responder(p.pergunta, ctx);
      if (r.tipo !== 'dados') continue;
      const extras = [r.texto.titulo, r.rotuloPeriodo ?? ''];
      for (const b of r.texto.bullets) {
        const soltos = numerosNaoRastreaveis(b, r.fatos, extras);
        if (soltos.length) problemas.push(`${p.id}: ${soltos.join(', ')} em "${b}"`);
      }
    }
    expect(problemas).toEqual([]);
  });
});

describe('funções do motor de insights', () => {
  it('decomposição soma exatamente a variação', () => {
    const d = decompor(new Map([['a', 10], ['b', 5], ['c', 1]]), new Map([['a', 4], ['b', 9], ['d', 2]]));
    expect(d.delta).toBe(1);
    expect(d.todos.reduce((s, c) => s + c.delta, 0)).toBe(1);
    expect(d.positivos.map((c) => c.segmento)).toEqual(['a', 'c']);
    expect(d.negativos.map((c) => c.segmento)).toEqual(['b', 'd']);
    expect(d.outros).toBe(0);
  });

  it('regressão, correlação e outliers', () => {
    expect(inclinacao([1, 2, 3, 4])).toBeCloseTo(1);
    expect(correlacao([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(outliers([1, 1, 1, 1, 1, 1, 50])).toEqual([6]);
    expect(outliers([1, 2])).toEqual([]);
  });

  it('validador pega número inventado', () => {
    const fatos = gerarFatos({
      spec: { intent: 'kpi', metrics: ['pedidos'], dimensions: [], filters: [] },
      semantica: semanticaOlist,
      linhas: [{ pedidos: 98199 }],
    });
    expect(numerosNaoRastreaveis('Foram 98.199 pedidos.', fatos)).toEqual([]);
    expect(numerosNaoRastreaveis('Foram 98.199 pedidos, 12% a mais.', fatos)).toEqual(['12%']);
  });
});
