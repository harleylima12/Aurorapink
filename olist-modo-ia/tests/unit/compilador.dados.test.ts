/**
 * O SQL do compilador rodando no DuckDB-WASM contra os dados reais.
 * Os números esperados são os do Power BI e os de dados/validacao.md.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { compilar } from '../../src/query/compiler';
import type { QuerySpec } from '../../src/query/spec';
import { semanticaOlist } from '../../src/semantic';
import { abrirBancoTeste, type BancoTeste } from './ajuda/duckdbNode';

let banco: BancoTeste;
beforeAll(async () => {
  banco = await abrirBancoTeste();
});

function rodar(spec: Partial<QuerySpec> & Pick<QuerySpec, 'metrics'>) {
  const completo: QuerySpec = { intent: 'kpi', dimensions: [], filters: [], ...spec };
  const { sql, params } = compilar(completo, semanticaOlist);
  return banco.consultar(sql, params);
}

describe('KPIs da base inteira = Power BI', () => {
  it('faturamento, pedidos, ticket médio e clientes', () => {
    const [linha] = rodar({ metrics: ['faturamento', 'pedidos', 'ticket_medio'] });
    expect(linha?.faturamento).toBeCloseTo(13_494_400.74, 2);
    expect(linha?.pedidos).toBe(98_199);
    expect(Number(linha?.ticket_medio).toFixed(2)).toBe('137.42');
    expect(rodar({ metrics: ['clientes'] })[0]?.clientes).toBe(94_983);
  });

  it('itens, frete total e frete médio por pedido', () => {
    const [linha] = rodar({ metrics: ['itens', 'frete_total', 'frete_medio'] });
    expect(linha?.itens).toBe(112_101);
    expect(linha?.frete_total).toBeCloseTo(2_245_816.19, 2);
    expect(Number(linha?.frete_medio).toFixed(2)).toBe('22.87');
  });
});

describe('métricas de pedido (P7)', () => {
  it('nota média por pedido = 4,12, não a média por item (4,05)', () => {
    const [linha] = rodar({ metrics: ['nota_media'] });
    expect(Number(linha?.nota_media).toFixed(3)).toBe('4.117');
  });

  it('entrega no recorte B igual à Fase 0 (6.531 atrasados em 96.203 entregues)', () => {
    const [linha] = rodar({
      metrics: ['pct_atraso', 'pct_no_prazo', 'prazo_medio_entrega'],
      time: { from: '2017-01-01', to: '2018-08-31' },
    });
    expect(linha?.pct_atraso).toBeCloseTo(6_531 / 96_203, 10);
    expect(linha?.pct_no_prazo).toBeCloseTo((96_203 - 6_531) / 96_203, 10);
    expect(Number(linha?.prazo_medio_entrega).toFixed(1)).toBe('12.5');
  });

  it('mistura métrica de item e de pedido na mesma consulta', () => {
    const linhas = rodar({ intent: 'ranking', metrics: ['faturamento', 'nota_media'], dimensions: ['categoria'], limit: 3 });
    expect(linhas.map((l) => l.categoria)).toEqual(['Beleza e Saúde', 'Relógios e Presentes', 'Cama, Mesa e Banho']);
    expect(linhas[0]?.faturamento).toBeCloseTo(1_255_695.13, 2);
    for (const l of linhas) expect(l.nota_media).toBeGreaterThan(3);
  });

  it('pedido com itens de 2 categorias conta nas duas (soma dos pedidos por categoria > total)', () => {
    const porCategoria = rodar({ metrics: ['pedidos'], dimensions: ['categoria'] });
    const soma = porCategoria.reduce((t, l) => t + Number(l.pedidos), 0);
    expect(soma).toBeGreaterThan(98_199);
  });
});

describe('dimensões', () => {
  it('tempo por mês, em ordem cronológica, com os pedidos da validação', () => {
    const linhas = rodar({ intent: 'tendencia', metrics: ['pedidos'], dimensions: ['tempo'], time: { grain: 'mes' } });
    expect(linhas[0]).toEqual({ tempo: '2016-09-01', pedidos: 2 });
    expect(linhas.find((l) => l.tempo === '2017-11-01')?.pedidos).toBe(7_421);
    expect(linhas.at(-1)).toEqual({ tempo: '2018-09-01', pedidos: 1 });
    expect(linhas.map((l) => l.tempo)).toEqual([...linhas.map((l) => String(l.tempo))].sort());
  });

  it('tempo por ano', () => {
    const linhas = rodar({ intent: 'tendencia', metrics: ['faturamento'], dimensions: ['tempo'], time: { grain: 'ano' } });
    expect(linhas.map((l) => l.tempo)).toEqual(['2016-01-01', '2017-01-01', '2018-01-01']);
    const total = linhas.reduce((t, l) => t + Number(l.faturamento), 0);
    expect(total).toBeCloseTo(13_494_400.74, 2);
  });

  it('faixa de preço na ordem das faixas, somando o total', () => {
    const linhas = rodar({ intent: 'distribuicao', metrics: ['itens'], dimensions: ['faixa_de_preco'] });
    expect(linhas.map((l) => l.faixa_de_preco)).toEqual([
      '< R$ 50',
      'R$ 50–100',
      'R$ 100–200',
      'R$ 200–500',
      'R$ 500–1.000',
      '≥ R$ 1.000',
    ]);
    expect(linhas.reduce((t, l) => t + Number(l.itens), 0)).toBe(112_101);
  });

  it('status de entrega na ordem fixa; atraso derruba a nota', () => {
    const linhas = rodar({ intent: 'comparacao', metrics: ['nota_media'], dimensions: ['status_entrega'] });
    expect(linhas.map((l) => l.status_entrega)).toEqual(['No Prazo', 'Atrasado', 'Não Entregue']);
    const [noPrazo, atrasado] = linhas;
    expect(Number(noPrazo?.nota_media)).toBeGreaterThan(Number(atrasado?.nota_media) + 1);
  });

  it('cidade vem com a UF (nomes repetidos entre estados não se misturam)', () => {
    const linhas = rodar({ intent: 'ranking', metrics: ['pedidos'], dimensions: ['cidade_cliente'], limit: 2 });
    expect(linhas.map((l) => l.cidade_cliente)).toEqual(['São Paulo (SP)', 'Rio de Janeiro (RJ)']);
  });

  it('duas dimensões ao mesmo tempo', () => {
    const linhas = rodar({ metrics: ['pedidos'], dimensions: ['estado_cliente', 'forma_pagamento'] });
    const sp = linhas.filter((l) => l.estado_cliente === 'SP');
    expect(sp.length).toBeGreaterThanOrEqual(4);
  });
});

describe('filtros parametrizados', () => {
  it('ano + estado', () => {
    const [linha] = rodar({
      metrics: ['pedidos'],
      time: { from: '2018-01-01', to: '2018-12-31' },
      filters: [{ dimension: 'estado_cliente', op: 'in', values: ['SP', 'RJ'] }],
    });
    expect(linha?.pedidos).toBe(30_115); // conferido com Python direto no Parquet
  });

  it('not_in e filtro de tempo por dimensão', () => {
    const todos = Number(rodar({ metrics: ['pedidos'] })[0]?.pedidos);
    const semSp = Number(rodar({ metrics: ['pedidos'], filters: [{ dimension: 'estado_cliente', op: 'not_in', values: ['SP'] }] })[0]?.pedidos);
    const soSp = Number(rodar({ metrics: ['pedidos'], filters: [{ dimension: 'estado_cliente', op: 'in', values: ['SP'] }] })[0]?.pedidos);
    expect(semSp + soSp).toBe(todos);
    const [nov] = rodar({
      metrics: ['pedidos'],
      filters: [{ dimension: 'tempo', op: 'between', values: ['2017-11-01', '2017-11-30'] }],
    });
    expect(nov?.pedidos).toBe(7_421);
  });

  it('valor com apóstrofo ou tentativa de injeção é só um valor', () => {
    const [comApostrofo] = rodar({
      metrics: ['pedidos'],
      filters: [{ dimension: 'cidade_cliente', op: 'in', values: ["Santa Bárbara d'Oeste (SP)"] }],
    });
    expect(comApostrofo?.pedidos).toBe(122); // conferido com Python direto no Parquet
    const [injecao] = rodar({
      metrics: ['pedidos'],
      filters: [{ dimension: 'estado_cliente', op: 'in', values: ["SP') OR 1=1 --"] }],
    });
    expect(injecao?.pedidos).toBe(0);
  });

  it('filtro de categoria em métrica de pedido: pedidos que têm a categoria', () => {
    const [linha] = rodar({
      metrics: ['nota_media', 'pedidos'],
      filters: [{ dimension: 'categoria', op: 'in', values: ['Beleza e Saúde'] }],
    });
    expect(linha?.pedidos).toBe(8_800);
    expect(Number(linha?.nota_media)).toBeGreaterThan(4);
  });
});
