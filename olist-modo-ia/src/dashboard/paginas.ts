/**
 * As 3 páginas do dashboard, descritas como QuerySpecs. Nada é pré-calculado:
 * cada KPI e cada gráfico passa pelo mesmo compilador que o Modo IA vai usar.
 */
import type { QuerySpec } from '../query/spec';

export type IdPagina = 'visao-geral' | 'produtos' | 'logistica';

export interface DefinicaoKpi {
  metrica: string;
  /** Destaca em vermelho (só atraso/negativo). */
  alerta?: boolean;
}

export type TipoVisual = 'linha' | 'barra' | 'coluna' | 'dispersao';

export interface DefinicaoVisual {
  id: string;
  titulo: string;
  subtitulo: string;
  tipo: TipoVisual;
  spec: QuerySpec;
  largo?: boolean;
  alerta?: boolean;
  /** Valores da dimensão pintados de vermelho (ex.: "Atrasado"). */
  valoresAlerta?: string[];
}

export interface DefinicaoPagina {
  id: IdPagina;
  titulo: string;
  descricao: string;
  kpis: DefinicaoKpi[];
  visuais: DefinicaoVisual[];
}

const base = { dimensions: [], filters: [] } satisfies Pick<QuerySpec, 'dimensions' | 'filters'>;

export const PAGINAS: DefinicaoPagina[] = [
  {
    id: 'visao-geral',
    titulo: 'Visão Geral',
    descricao: 'Vendas, pedidos e clientes',
    kpis: [{ metrica: 'faturamento' }, { metrica: 'pedidos' }, { metrica: 'ticket_medio' }, { metrica: 'clientes' }],
    visuais: [
      {
        id: 'faturamento-mensal',
        titulo: 'Faturamento mês a mês',
        subtitulo: 'Soma do preço dos itens, sem frete. Faixas cinza: meses com poucos pedidos na base.',
        tipo: 'linha',
        largo: true,
        spec: { ...base, intent: 'tendencia', metrics: ['faturamento'], dimensions: ['tempo'], time: { grain: 'mes' } },
      },
      {
        id: 'faturamento-estado',
        titulo: 'Faturamento por estado',
        subtitulo: 'Top 10 estados do cliente',
        tipo: 'barra',
        spec: { ...base, intent: 'ranking', metrics: ['faturamento'], dimensions: ['estado_cliente'], limit: 10 },
      },
      {
        id: 'pedidos-pagamento',
        titulo: 'Pedidos por forma de pagamento',
        subtitulo: 'Forma principal do pedido (a que pagou o maior valor)',
        tipo: 'coluna',
        spec: { ...base, intent: 'comparacao', metrics: ['pedidos'], dimensions: ['forma_pagamento'] },
      },
    ],
  },
  {
    id: 'produtos',
    titulo: 'Produtos',
    descricao: 'Categorias, preços e satisfação',
    kpis: [{ metrica: 'itens' }, { metrica: 'preco_medio' }, { metrica: 'faturamento' }, { metrica: 'nota_media' }],
    visuais: [
      {
        id: 'top-categorias',
        titulo: 'Categorias que mais faturam',
        subtitulo: 'Top 15 por faturamento',
        tipo: 'barra',
        largo: true,
        spec: { ...base, intent: 'ranking', metrics: ['faturamento'], dimensions: ['categoria'], limit: 15 },
      },
      {
        id: 'faixa-preco',
        titulo: 'Itens por faixa de preço',
        subtitulo: 'Preço de cada item vendido',
        tipo: 'coluna',
        spec: { ...base, intent: 'distribuicao', metrics: ['itens'], dimensions: ['faixa_de_preco'] },
      },
      {
        id: 'faturamento-nota',
        titulo: 'Faturamento × nota média',
        subtitulo: 'Cada ponto é uma categoria; nota calculada por pedido',
        tipo: 'dispersao',
        spec: { ...base, intent: 'comparacao', metrics: ['faturamento', 'nota_media'], dimensions: ['categoria'] },
      },
    ],
  },
  {
    id: 'logistica',
    titulo: 'Logística',
    descricao: 'Prazos, atrasos e frete',
    kpis: [
      { metrica: 'prazo_medio_entrega' },
      { metrica: 'pct_no_prazo' },
      { metrica: 'pct_atraso', alerta: true },
      { metrica: 'frete_medio' },
    ],
    visuais: [
      {
        id: 'atraso-mensal',
        titulo: '% de atraso mês a mês',
        subtitulo: 'Pedidos entregues depois do dia estimado, sobre os entregues',
        tipo: 'linha',
        largo: true,
        alerta: true,
        spec: { ...base, intent: 'tendencia', metrics: ['pct_atraso'], dimensions: ['tempo'], time: { grain: 'mes' } },
      },
      {
        id: 'nota-status',
        titulo: 'Nota média por status de entrega',
        subtitulo: 'O impacto do atraso na satisfação (nota por pedido)',
        tipo: 'coluna',
        valoresAlerta: ['Atrasado'],
        spec: { ...base, intent: 'comparacao', metrics: ['nota_media'], dimensions: ['status_entrega'] },
      },
      {
        id: 'frete-estado',
        titulo: 'Frete médio por estado',
        subtitulo: 'Top 10 estados com o frete por pedido mais caro',
        tipo: 'barra',
        spec: { ...base, intent: 'ranking', metrics: ['frete_medio'], dimensions: ['estado_cliente'], limit: 10 },
      },
    ],
  },
];

/** Spec do valor de um KPI e da sua minissérie mensal. */
export function specsDoKpi(metrica: string): { valor: QuerySpec; serie: QuerySpec } {
  return {
    valor: { ...base, intent: 'kpi', metrics: [metrica] },
    serie: { ...base, intent: 'tendencia', metrics: [metrica], dimensions: ['tempo'], time: { grain: 'mes' } },
  };
}
