/**
 * Few-shots do planejador (seção 10 da especificação). Cada exemplo é um par pergunta -> QuerySpec.
 * Datas relativas assumem a âncora da Olist (31/08/2018).
 */
import type { QuerySpec } from '../../query/spec';

export interface Exemplo {
  pergunta: string;
  anterior?: QuerySpec;
  spec: QuerySpec;
  /** Sempre entra no prompt (fora de escopo e esclarecimento ensinam a recusar). */
  fixo?: boolean;
}

const top5em2018: QuerySpec = {
  intent: 'ranking',
  metrics: ['faturamento'],
  dimensions: ['categoria'],
  filters: [],
  time: { from: '2018-01-01', to: '2018-12-31' },
  sort: { by: 'faturamento', dir: 'desc' },
  limit: 5,
};

export const EXEMPLOS: Exemplo[] = [
  { pergunta: 'quanto faturamos no total?', spec: { intent: 'kpi', metrics: ['faturamento'], dimensions: [], filters: [] } },
  { pergunta: 'top 5 categorias em 2018', spec: top5em2018 },
  { pergunta: 'pedidos mês a mês', spec: { intent: 'tendencia', metrics: ['pedidos'], dimensions: ['tempo'], filters: [], time: { grain: 'mes' } } },
  {
    pergunta: 'nota de quem recebeu atrasado vs no prazo',
    spec: { intent: 'comparacao', metrics: ['nota_media'], dimensions: ['status_entrega'], filters: [{ dimension: 'status_entrega', op: 'in', values: ['Atrasado', 'No Prazo'] }] },
  },
  {
    pergunta: 'onde o frete é mais caro?',
    spec: { intent: 'ranking', metrics: ['frete_medio'], dimensions: ['estado_cliente'], filters: [], sort: { by: 'frete_medio', dir: 'desc' }, limit: 10 },
  },
  {
    pergunta: 'e só em SP?',
    anterior: top5em2018,
    spec: { ...top5em2018, filters: [{ dimension: 'estado_cliente', op: 'in', values: ['SP'] }] },
  },
  {
    pergunta: 'por que o faturamento caiu em dez/2017?',
    spec: {
      intent: 'explicar_variacao',
      metrics: ['faturamento'],
      dimensions: ['categoria'],
      filters: [],
      time: { from: '2017-12-01', to: '2017-12-31', compare: 'periodo_anterior' },
    },
  },
  {
    pergunta: 'qual o lucro por categoria?',
    fixo: true,
    spec: { intent: 'fora_de_escopo', metrics: [], dimensions: [], filters: [], out_of_scope_reason: 'Não há dados de custo. Posso mostrar faturamento ou ticket médio.' },
  },
  {
    pergunta: 'como estamos?',
    fixo: true,
    spec: {
      intent: 'esclarecer',
      metrics: [],
      dimensions: [],
      filters: [],
      clarify: { question: 'O que você quer ver?', options: ['Faturamento do período', 'Evolução mensal', 'Satisfação dos clientes'] },
    },
  },
  { pergunta: 'ticket médio por forma de pagamento', spec: { intent: 'comparacao', metrics: ['ticket_medio'], dimensions: ['forma_pagamento'], filters: [] } },
];
