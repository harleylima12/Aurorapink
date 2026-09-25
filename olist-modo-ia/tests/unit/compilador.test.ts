/** Compilador spec -> SQL: snapshots (o SQL exato) e erros esperados. Não precisa de banco. */
import { describe, expect, it } from 'vitest';

import { compilar, ErroCompilacao } from '../../src/query/compiler';
import type { QuerySpec } from '../../src/query/spec';
import { semanticaOlist } from '../../src/semantic';

function spec(parcial: Partial<QuerySpec> & Pick<QuerySpec, 'metrics'>): QuerySpec {
  return { intent: 'kpi', dimensions: [], filters: [], ...parcial };
}

describe('snapshots do SQL', () => {
  const casos: Record<string, QuerySpec> = {
    '1 KPI sem filtro': spec({ metrics: ['faturamento'] }),
    'KPIs do dashboard com ano e estado': spec({
      metrics: ['faturamento', 'pedidos', 'ticket_medio', 'clientes'],
      time: { from: '2018-01-01', to: '2018-12-31' },
      filters: [{ dimension: 'estado_cliente', op: 'in', values: ['SP'] }],
    }),
    'top 5 categorias em 2018': spec({
      intent: 'ranking',
      metrics: ['faturamento'],
      dimensions: ['categoria'],
      time: { from: '2018-01-01', to: '2018-12-31' },
      limit: 5,
    }),
    'pedidos mês a mês': spec({ intent: 'tendencia', metrics: ['pedidos'], dimensions: ['tempo'], time: { grain: 'mes' } }),
    'nota: atrasado vs no prazo (métrica de pedido)': spec({
      intent: 'comparacao',
      metrics: ['nota_media'],
      dimensions: ['status_entrega'],
    }),
    'item + pedido por categoria (join)': spec({
      intent: 'ranking',
      metrics: ['faturamento', 'nota_media'],
      dimensions: ['categoria'],
      sort: { by: 'nota_media', dir: 'asc' },
      limit: 3,
    }),
    'faixa de preço': spec({ intent: 'distribuicao', metrics: ['itens'], dimensions: ['faixa_de_preco'] }),
    'filtro not_in e tempo between': spec({
      metrics: ['pct_atraso'],
      filters: [
        { dimension: 'forma_pagamento', op: 'not_in', values: ['Boleto', 'Voucher'] },
        { dimension: 'tempo', op: 'between', values: ['2017-11-01', '2017-11-30'] },
      ],
    }),
  };

  for (const [nome, s] of Object.entries(casos)) {
    it(nome, () => {
      expect(compilar(s, semanticaOlist)).toMatchSnapshot();
    });
  }
});

describe('segurança', () => {
  it('valores nunca entram no texto do SQL', () => {
    const malicioso = "SP'); DROP TABLE fato_itens; --";
    const { sql, params } = compilar(
      spec({ metrics: ['pedidos'], filters: [{ dimension: 'estado_cliente', op: 'in', values: [malicioso] }] }),
      semanticaOlist,
    );
    expect(sql).not.toContain('DROP');
    expect(params).toEqual([malicioso]);
  });

  it('métrica ou dimensão fora do catálogo é recusada', () => {
    expect(() => compilar(spec({ metrics: ['lucro'] }), semanticaOlist)).toThrow(ErroCompilacao);
    expect(() => compilar(spec({ metrics: ['pedidos'], dimensions: ['senha'] }), semanticaOlist)).toThrow(/desconhecida/);
  });

  it('datas fora do formato AAAA-MM-DD são recusadas', () => {
    expect(() => compilar(spec({ metrics: ['pedidos'], time: { from: "2018' OR 1=1" } }), semanticaOlist)).toThrow(/AAAA/);
  });
});

describe('regras', () => {
  it('esclarecer e fora_de_escopo não geram SQL', () => {
    expect(() => compilar(spec({ intent: 'fora_de_escopo', metrics: [] }), semanticaOlist)).toThrow(/não gera consulta/);
  });

  it('ranking usa o limite padrão (10) quando o spec não diz', () => {
    const { sql } = compilar(spec({ intent: 'ranking', metrics: ['pedidos'], dimensions: ['categoria'] }), semanticaOlist);
    expect(sql).toMatch(/LIMIT 10$/);
  });

  it('operador inválido para o tipo de dimensão', () => {
    expect(() =>
      compilar(spec({ metrics: ['pedidos'], filters: [{ dimension: 'categoria', op: 'gte', values: ['a'] }] }), semanticaOlist),
    ).toThrow(/não vale/);
    expect(() =>
      compilar(spec({ metrics: ['pedidos'], filters: [{ dimension: 'tempo', op: 'in', values: ['2018-01-01'] }] }), semanticaOlist),
    ).toThrow(/não vale para tempo/);
  });

  it('grão de tempo inexistente', () => {
    const semHora = { ...semanticaOlist };
    expect(() =>
      compilar(spec({ metrics: ['pedidos'], dimensions: ['tempo'], time: { grain: 'hora' as 'dia' } }), semHora),
    ).toThrow();
  });

  it('ordenar por métrica que não está na consulta', () => {
    expect(() =>
      compilar(spec({ metrics: ['pedidos'], dimensions: ['categoria'], sort: { by: 'faturamento', dir: 'desc' } }), semanticaOlist),
    ).toThrow(/ordenação/);
  });

  it('devolve as colunas com rótulo e formato', () => {
    const { colunas } = compilar(spec({ metrics: ['faturamento'], dimensions: ['categoria'] }), semanticaOlist);
    expect(colunas).toEqual([
      { id: 'categoria', papel: 'dimensao', label: 'Categoria', tipoDimensao: 'categoria' },
      { id: 'faturamento', papel: 'metrica', label: 'Faturamento', formato: 'brl' },
    ]);
  });
});
