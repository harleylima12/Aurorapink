/** A camada semântica é válida e TODA métrica e dimensão compila e roda nos dados reais. */
import { beforeAll, describe, expect, it } from 'vitest';

import { compilar } from '../../src/query/compiler';
import { criarSchemaQuerySpec, type QuerySpec } from '../../src/query/spec';
import { semanticaOlist } from '../../src/semantic';
import { carregarSemantica } from '../../src/semantic/schema';
import bruto from '../../src/semantic/semantic.json';
import { abrirBancoTeste, type BancoTeste } from './ajuda/duckdbNode';

let banco: BancoTeste;
beforeAll(async () => {
  banco = await abrirBancoTeste();
});

const MINIMAS = [
  'faturamento', 'frete_total', 'frete_medio', 'pedidos', 'itens', 'ticket_medio', 'clientes',
  'prazo_medio_entrega', 'pct_no_prazo', 'pct_atraso', 'nota_media',
];
const DIMENSOES_MINIMAS = [
  'tempo', 'categoria', 'estado_cliente', 'cidade_cliente', 'estado_vendedor', 'status_entrega', 'forma_pagamento',
  'faixa_de_preco',
];

describe('semantic.json', () => {
  it('tem as métricas e dimensões mínimas da especificação (seção 7)', () => {
    expect(Object.keys(semanticaOlist.metrics)).toEqual(expect.arrayContaining(MINIMAS));
    expect(Object.keys(semanticaOlist.dimensions)).toEqual(expect.arrayContaining(DIMENSOES_MINIMAS));
  });

  it('recusa id que não serve como nome de coluna', () => {
    const copia = structuredClone(bruto) as { metrics: Record<string, unknown> };
    copia.metrics['fat; DROP'] = copia.metrics.faturamento;
    expect(() => carregarSemantica(copia)).toThrow();
  });

  it('toda métrica roda, sozinha e por categoria', () => {
    for (const id of Object.keys(semanticaOlist.metrics)) {
      const s: QuerySpec = { intent: 'ranking', metrics: [id], dimensions: ['categoria'], filters: [] };
      const { sql, params } = compilar(s, semanticaOlist);
      const linhas = banco.consultar(sql, params);
      expect(linhas.length, id).toBeGreaterThan(0);
      expect(typeof linhas[0]?.[id], id).toBe('number');
    }
  });

  it('toda dimensão roda', () => {
    for (const id of Object.keys(semanticaOlist.dimensions)) {
      const { sql, params } = compilar({ intent: 'comparacao', metrics: ['pedidos'], dimensions: [id], filters: [] }, semanticaOlist);
      expect(banco.consultar(sql, params).length, id).toBeGreaterThan(1);
    }
  });

  it('os valores com apelido (value_aliases, order) existem de verdade nos dados', () => {
    for (const [id, dim] of Object.entries(semanticaOlist.dimensions)) {
      if (dim.type !== 'categoria') continue;
      const esperados = [...Object.keys(dim.value_aliases ?? {}), ...(dim.order ?? [])];
      if (esperados.length === 0) continue;
      const { sql, params } = compilar({ intent: 'comparacao', metrics: ['pedidos'], dimensions: [id], filters: [] }, semanticaOlist);
      const reais = new Set(banco.consultar(sql, params).map((l) => l[id]));
      for (const valor of esperados) expect(reais.has(valor), `${id}: ${valor}`).toBe(true);
    }
  });
});

describe('schema do QuerySpec', () => {
  const schema = criarSchemaQuerySpec(semanticaOlist);

  it('aceita um spec válido', () => {
    const r = schema.safeParse({
      intent: 'ranking',
      metrics: ['faturamento'],
      dimensions: ['categoria'],
      time: { from: '2018-01-01', to: '2018-12-31' },
      filters: [{ dimension: 'estado_cliente', op: 'in', values: ['SP'] }],
      limit: 5,
    });
    expect(r.success).toBe(true);
  });

  it.each([
    ['métrica inventada', { intent: 'kpi', metrics: ['lucro'], dimensions: [], filters: [] }],
    ['mais de 3 métricas', { intent: 'kpi', metrics: ['faturamento', 'pedidos', 'itens', 'clientes'], dimensions: [], filters: [] }],
    ['kpi sem métrica', { intent: 'kpi', metrics: [], dimensions: [], filters: [] }],
    ['limit 51', { intent: 'ranking', metrics: ['pedidos'], dimensions: ['categoria'], filters: [], limit: 51 }],
    ['data inválida', { intent: 'kpi', metrics: ['pedidos'], dimensions: [], filters: [], time: { from: '31/12/2018' } }],
    ['período invertido', { intent: 'kpi', metrics: ['pedidos'], dimensions: [], filters: [], time: { from: '2018-12-31', to: '2018-01-01' } }],
    ['dimensão repetida', { intent: 'kpi', metrics: ['pedidos'], dimensions: ['categoria', 'categoria'], filters: [] }],
    ['esclarecer sem pergunta', { intent: 'esclarecer', metrics: [], dimensions: [], filters: [] }],
  ])('recusa: %s', (_nome, entrada) => {
    expect(schema.safeParse(entrada).success).toBe(false);
  });

  it('fora_de_escopo pode vir sem métrica', () => {
    const r = schema.safeParse({ intent: 'fora_de_escopo', metrics: [], dimensions: [], filters: [], out_of_scope_reason: 'lucro' });
    expect(r.success).toBe(true);
  });
});
