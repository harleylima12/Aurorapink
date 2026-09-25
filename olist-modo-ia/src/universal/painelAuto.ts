/**
 * Dashboard automático (seção 7A item 7) e Modo IA da planilha, a partir da semântica gerada.
 * Funções puras: escolhem os 4 KPIs, a evolução no tempo e os 2 rankings mais úteis, e geram
 * sugestões de pergunta e few-shots do planejador com os RÓTULOS REAIS das colunas (seção 10).
 */
import type { Exemplo } from '../ai/prompts/exemplos';
import type { DefinicaoKpi, DefinicaoVisual } from '../dashboard/paginas';
import type { QuerySpec } from '../query/spec';
import type { Semantica } from '../semantic/schema';
import { DICAS, palavras, temDica, type ColunaConfig } from './perfil';

export interface PainelPlanilha {
  kpis: DefinicaoKpi[];
  visuais: DefinicaoVisual[];
  /** Métrica principal (a do gráfico de tempo e dos rankings). */
  principal: string;
  dimensoes: string[];
}

const DIMENSOES_DE_NEGOCIO = ['categoria', 'segmento', 'tipo', 'departamento', 'setor', 'produto', 'linha', 'regiao', 'uf', 'estado', 'canal', 'centro',
  'cargo', 'prioridade', 'turma', 'status', 'region', 'category', 'segment', 'fornecedor', 'armazem'];

const base = { filters: [] } satisfies Pick<QuerySpec, 'filters'>;

/** Métrica principal: a soma de dinheiro com nome mais "de venda"; senão, a primeira soma; senão, registros. */
export function metricaPrincipal(semantica: Semantica, config: readonly ColunaConfig[]): string {
  const somas = config.filter((c) => c.papel === 'metrica' && c.agregacao === 'soma');
  const nota = (c: ColunaConfig) =>
    (c.tipo === 'dinheiro' ? 2 : 0) + (temDica(palavras(c.rotulo), ['valor', 'receita', 'venda', 'vendas', 'faturamento', 'total', 'revenue', 'sales']) ? 1 : 0);
  const [melhor] = [...somas].sort((a, b) => nota(b) - nota(a));
  const id = melhor ? `soma_${melhor.id}` : 'registros';
  return semantica.metrics[id] ? id : 'registros';
}

export function montarPainel(semantica: Semantica, config: readonly ColunaConfig[], distintos: Readonly<Record<string, number>>): PainelPlanilha {
  const principal = metricaPrincipal(semantica, config);
  const ids = Object.keys(semantica.metrics);
  const kpis: string[] = [principal];
  const acrescentar = (id: string | undefined) => {
    if (id && semantica.metrics[id] && !kpis.includes(id) && kpis.length < 4) kpis.push(id);
  };
  acrescentar('registros');
  acrescentar(ids.find((m) => m.startsWith('distintos_')));
  acrescentar(principal.startsWith('soma_') ? principal.replace('soma_', 'media_') : undefined);
  for (const m of ids) acrescentar(m);

  // Dimensões mais úteis: categoria/UF com 3 a 30 valores primeiro; Sim/Não e cidade (muitos valores) depois.
  const colunaDe = (dim: string) => {
    const d = semantica.dimensions[dim];
    return d && d.type !== 'tempo' && 'column' in d ? config.find((c) => c.id === d.column) : undefined;
  };
  const nota = (dim: string) => {
    const c = colunaDe(dim);
    const n = c ? (distintos[c.id] ?? 0) : 0;
    const tipo = c?.tipo === 'booleano' ? 1 : c?.tipo === 'cidade' ? 2 : 3;
    // Nomes típicos de dimensão de negócio ganham de colunas com nomes de pessoas (ex.: vendedor).
    const negocio = c && temDica(palavras(c.rotulo), DIMENSOES_DE_NEGOCIO) ? 3 : 0;
    return tipo * 10 + (n >= 3 && n <= 30 ? 5 : 0) + negocio - Math.abs(n - 8) / 100;
  };
  const dimensoes = Object.keys(semantica.dimensions)
    .filter((d) => semantica.dimensions[d]?.type !== 'tempo')
    .sort((a, b) => nota(b) - nota(a))
    .slice(0, 2);

  const metrica = semantica.metrics[principal];
  const visuais: DefinicaoVisual[] = [];
  const tempo = semantica.dimensions.tempo;
  if (tempo) {
    visuais.push({
      id: 'auto-tempo',
      titulo: `${metrica?.label ?? principal} ao longo do tempo`,
      subtitulo: `Por mês, pela coluna "${tempo.label}"`,
      tipo: 'linha',
      largo: true,
      spec: { ...base, intent: 'tendencia', metrics: [principal], dimensions: ['tempo'], time: { grain: 'mes' } },
    });
  }
  for (const dim of dimensoes) {
    const c = colunaDe(dim);
    const n = c ? (distintos[c.id] ?? 0) : 0;
    const rotulo = semantica.dimensions[dim]?.label ?? dim;
    const poucos = n > 0 && n <= 8;
    visuais.push({
      id: `auto-${dim}`,
      titulo: `${metrica?.label ?? principal} por ${minusculo(rotulo)}`,
      subtitulo: poucos ? `Os ${n} valores de "${rotulo}"` : `Top 10 de "${rotulo}" (${n} valores diferentes)`,
      tipo: poucos ? 'coluna' : 'barra',
      spec: poucos
        ? { ...base, intent: 'comparacao', metrics: [principal], dimensions: [dim] }
        : { ...base, intent: 'ranking', metrics: [principal], dimensions: [dim], limit: 10, sort: { by: principal, dir: 'desc' } },
    });
  }
  return { kpis: kpis.map((metrica) => ({ metrica })), visuais, principal, dimensoes };
}

/** Minúscula só na 1ª letra, e nunca em sigla (UF, SKU). */
const minusculo = (t: string) => (/^[A-Z0-9]{2,}\b/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));

/** Chips do Modo IA com as colunas reais (todas respondíveis pela Camada 0). */
export function sugestoesDaPlanilha(semantica: Semantica, painel: PainelPlanilha): string[] {
  const m = semantica.metrics[painel.principal]?.label ?? 'Registros';
  const [d1, d2] = painel.dimensoes.map((d) => semantica.dimensions[d]?.label ?? d);
  const saida = [`${m} total`];
  if (semantica.dimensions.tempo) saida.push(`${m} mês a mês`);
  if (d1) saida.push(`Top 5 ${minusculo(d1)} por ${minusculo(m)}`);
  if (d2) saida.push(`${m} por ${minusculo(d2)}`);
  saida.push('Quantos registros?');
  return saida;
}

/** Few-shots do planejador para a planilha: pelo menos 1 por intenção, com os rótulos reais (seção 10). */
export function exemplosDaPlanilha(semantica: Semantica): Exemplo[] {
  const metricas = Object.keys(semantica.metrics);
  const principal = metricas.find((m) => m.startsWith('soma_')) ?? 'registros';
  const media = metricas.find((m) => m.startsWith('media_'));
  const rotulo = (id: string) => minusculo(semantica.metrics[id]?.label ?? id);
  const dims = Object.entries(semantica.dimensions).filter(([, d]) => d.type === 'categoria');
  const [dim1, dim2] = dims.map(([id]) => id);
  const rot = (id: string) => minusculo(semantica.dimensions[id]?.label ?? id);
  const temTempo = Boolean(semantica.dimensions.tempo);
  const ate = semantica.defaults.periodo.ate;
  const ano = ate.slice(0, 4);
  const ex: Exemplo[] = [{ pergunta: `qual o ${rotulo(principal)} total?`, spec: { intent: 'kpi', metrics: [principal], dimensions: [], filters: [] } }];
  if (temTempo) {
    ex.push({ pergunta: `${rotulo(principal)} mês a mês`, spec: { intent: 'tendencia', metrics: [principal], dimensions: ['tempo'], filters: [], time: { grain: 'mes' } } });
    ex.push({
      pergunta: `por que o ${rotulo(principal)} mudou em ${ano}?`,
      spec: { intent: 'explicar_variacao', metrics: [principal], dimensions: [dim1 ?? 'tempo'].filter((d) => d !== 'tempo'), filters: [], time: { from: `${ano}-01-01`, to: `${ano}-12-31`, compare: 'periodo_anterior' } },
    });
  }
  if (dim1) {
    const topo: QuerySpec = { intent: 'ranking', metrics: [principal], dimensions: [dim1], filters: [], sort: { by: principal, dir: 'desc' }, limit: 5 };
    ex.push({ pergunta: `top 5 ${rot(dim1)} por ${rotulo(principal)}`, spec: topo });
    if (temTempo) ex.push({ pergunta: `e em ${ano}?`, anterior: topo, spec: { ...topo, time: { from: `${ano}-01-01`, to: `${ano}-12-31` } } });
  }
  if (dim2 && media) ex.push({ pergunta: `${rotulo(media)} por ${rot(dim2)}`, spec: { intent: 'comparacao', metrics: [media], dimensions: [dim2], filters: [] } });
  ex.push({
    pergunta: 'qual o lucro líquido?',
    fixo: true,
    spec: { intent: 'fora_de_escopo', metrics: [], dimensions: [], filters: [], out_of_scope_reason: `A planilha não tem essa informação. Posso mostrar ${rotulo(principal)}.` },
  });
  ex.push({
    pergunta: 'como estamos?',
    fixo: true,
    spec: {
      intent: 'esclarecer',
      metrics: [],
      dimensions: [],
      filters: [],
      clarify: { question: 'O que você quer ver?', options: [`${semantica.metrics[principal]?.label ?? principal} total`, ...(dim1 ? [`Por ${rot(dim1)}`] : []), 'Quantos registros'].slice(0, 3) },
    },
  });
  return ex;
}

export { DICAS };
