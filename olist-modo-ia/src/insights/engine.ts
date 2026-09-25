/**
 * Motor de insights (determinístico, funções puras). Transforma o resultado do DuckDB em FATOS:
 * `{ id, tipo, rotulo, valor, valor_formatado, importancia }`.
 *
 * O narrador (template agora, IA na Fase 4) só pode citar estes fatos: todo número que aparece
 * no texto nasceu aqui, a partir do DuckDB, formatado com Intl pt-BR.
 */
import type { Linha } from '../data/duckdb';
import { formatar, rotuloPeriodo } from '../format/numeros';
import type { Grao, QuerySpec } from '../query/spec';
import type { Formato, Semantica } from '../semantic/schema';
import { decompor, type Decomposicao } from './drivers';

export type TipoFato =
  | 'total'
  | 'variacao'
  | 'lider'
  | 'participacao'
  | 'concentracao'
  | 'maximo'
  | 'minimo'
  | 'tendencia'
  | 'ultimo'
  | 'outlier'
  | 'diferenca'
  | 'correlacao'
  | 'contribuicao'
  | 'razao';

export interface Fato {
  id: string;
  tipo: TipoFato;
  /** A que o fato se refere ("Beleza e Saúde", "nov/2017", "total"). */
  rotulo: string;
  valor: number;
  valor_formatado: string;
  /** 0 a 1: ordem de destaque no texto. */
  importancia: number;
}

export interface EntradaInsights {
  spec: QuerySpec;
  semantica: Semantica;
  linhas: Linha[];
  /** Total da métrica com os mesmos filtros, sem dimensão (para participação). */
  total?: number | null;
  /** Linhas do período de comparação (KPI com `compare`). */
  comparacao?: Linha[] | null;
  /** Para explicar_variacao: linhas por segmento do período anterior. */
  anteriorPorSegmento?: Linha[] | null;
  mesesParciais?: ReadonlySet<string>;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function sinal(texto: string, valor: number): string {
  return valor > 0 ? `+${texto}` : texto;
}

export function fato(id: string, tipo: TipoFato, rotulo: string, valor: number, formato: Formato, importancia: number, comSinal = false): Fato {
  const texto = formatar(valor, formato);
  return { id, tipo, rotulo, valor, valor_formatado: comSinal ? sinal(texto, valor) : texto, importancia };
}

/** Inclinação da regressão linear (mínimos quadrados) sobre os índices 0..n-1. */
export function inclinacao(valores: readonly number[]): number {
  const n = valores.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = valores.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varx = 0;
  valores.forEach((v, i) => {
    cov += (i - mx) * (v - my);
    varx += (i - mx) ** 2;
  });
  return varx ? cov / varx : 0;
}

export function correlacao(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let c = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - mx;
    const dy = (ys[i] ?? 0) - my;
    c += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  return vx && vy ? c / Math.sqrt(vx * vy) : 0;
}

/** Índices com |z-score| > 2 (só com 5 ou mais valores). */
export function outliers(valores: readonly number[]): number[] {
  if (valores.length < 5) return [];
  const media = valores.reduce((s, v) => s + v, 0) / valores.length;
  const dp = Math.sqrt(valores.reduce((s, v) => s + (v - media) ** 2, 0) / valores.length);
  if (!dp) return [];
  return valores.flatMap((v, i) => (Math.abs((v - media) / dp) > 2 ? [i] : []));
}

export function gerarFatos(entrada: EntradaInsights): Fato[] {
  const { spec, semantica, linhas } = entrada;
  const [idMetrica, idMetrica2] = spec.metrics;
  const metrica = idMetrica ? semantica.metrics[idMetrica] : undefined;
  if (!metrica || !idMetrica) return [];
  const fmt = metrica.format;
  const fatos: Fato[] = [];
  const dims = spec.dimensions;

  // KPI (sem dimensão), com variação se houver comparação.
  if (dims.length === 0) {
    const valor = num(linhas[0]?.[idMetrica]);
    if (valor === null) return [];
    fatos.push(fato('total', 'total', metrica.label, valor, fmt, 1));
    const anterior = num(entrada.comparacao?.[0]?.[idMetrica]);
    if (anterior !== null) {
      fatos.push(fato('anterior', 'total', 'período de comparação', anterior, fmt, 0.6));
      fatos.push(fato('variacao_abs', 'variacao', 'variação', valor - anterior, fmt, 0.9, true));
      if (anterior !== 0) fatos.push(fato('variacao_pct', 'variacao', 'variação %', (valor - anterior) / Math.abs(anterior), 'pct', 0.95, true));
    }
    for (const [i, id] of spec.metrics.slice(1).entries()) {
      const m = semantica.metrics[id];
      const v = num(linhas[0]?.[id]);
      if (m && v !== null) fatos.push(fato(`total_${i + 2}`, 'total', m.label, v, m.format, 0.8));
    }
    return fatos;
  }

  const [dim] = dims;
  const ehTempo = dim === 'tempo';

  // Série no tempo.
  if (ehTempo && dim) {
    const grao: Grao = spec.time?.grain ?? 'mes';
    const pontos = linhas
      .map((l) => ({ periodo: String(l[dim]), valor: num(l[idMetrica]) }))
      .filter((p): p is { periodo: string; valor: number } => p.valor !== null);
    // Meses com poucos pedidos (base incompleta) ficam fora de máximo, mínimo e tendência.
    const completos = grao === 'mes' ? pontos.filter((p) => !entrada.mesesParciais?.has(p.periodo)) : pontos;
    const base = completos.length >= 2 ? completos : pontos;
    if (!base.length) return [];
    const maior = base.reduce((a, b) => (b.valor > a.valor ? b : a));
    const menor = base.reduce((a, b) => (b.valor < a.valor ? b : a));
    fatos.push(fato('maximo', 'maximo', rotuloPeriodo(maior.periodo, grao), maior.valor, fmt, 0.9));
    fatos.push(fato('minimo', 'minimo', rotuloPeriodo(menor.periodo, grao), menor.valor, fmt, 0.6));
    const media = base.reduce((s, p) => s + p.valor, 0) / base.length;
    if (media) fatos.push(fato('pico_vs_media', 'razao', rotuloPeriodo(maior.periodo, grao), maior.valor / media - 1, 'pct', 0.7, true));
    const slope = inclinacao(base.map((p) => p.valor));
    if (media) fatos.push(fato('tendencia', 'tendencia', `por ${grao === 'mes' ? 'mês' : grao}`, slope / media, 'pct', 0.8, true));
    const [penultimo, ultimo] = base.slice(-2);
    if (penultimo && ultimo && penultimo.valor) {
      fatos.push(fato('ultimo', 'ultimo', rotuloPeriodo(ultimo.periodo, grao), ultimo.valor, fmt, 0.5));
      fatos.push(fato('ultimo_var', 'variacao', `${rotuloPeriodo(ultimo.periodo, grao)} vs ${rotuloPeriodo(penultimo.periodo, grao)}`, (ultimo.valor - penultimo.valor) / Math.abs(penultimo.valor), 'pct', 0.6, true));
    }
    if (entrada.mesesParciais && pontos.some((p) => entrada.mesesParciais?.has(p.periodo))) {
      const parciais = pontos.filter((p) => entrada.mesesParciais?.has(p.periodo)).length;
      fatos.push({ id: 'parciais', tipo: 'total', rotulo: 'meses com poucos pedidos', valor: parciais, valor_formatado: formatar(parciais, 'int'), importancia: 0.3 });
    }
    return fatos;
  }

  if (!dim) return fatos;

  // Decomposição da variação (explicar_variacao).
  if (spec.intent === 'explicar_variacao' && entrada.anteriorPorSegmento) {
    const mapa = (ls: Linha[]) => new Map(ls.map((l) => [String(l[dim]), num(l[idMetrica]) ?? 0]));
    const d: Decomposicao = decompor(mapa(linhas), mapa(entrada.anteriorPorSegmento));
    fatos.push(fato('total', 'total', 'período', d.totalAtual, fmt, 0.7));
    fatos.push(fato('anterior', 'total', 'período anterior', d.totalAnterior, fmt, 0.6));
    fatos.push(fato('variacao_abs', 'variacao', 'variação', d.delta, fmt, 1, true));
    if (d.totalAnterior) fatos.push(fato('variacao_pct', 'variacao', 'variação %', d.delta / Math.abs(d.totalAnterior), 'pct', 0.95, true));
    const principais = d.delta < 0 ? d.negativos : d.positivos;
    const contrarios = d.delta < 0 ? d.positivos : d.negativos;
    principais.forEach((c, i) => {
      fatos.push(fato(`contrib_${i + 1}`, 'contribuicao', c.segmento, c.delta, fmt, 0.9 - i * 0.1, true));
      fatos.push(fato(`contrib_${i + 1}_parte`, 'participacao', c.segmento, c.parteDoDelta, 'pct', 0.5));
    });
    contrarios.forEach((c, i) => fatos.push(fato(`contra_${i + 1}`, 'contribuicao', c.segmento, c.delta, fmt, 0.5 - i * 0.1, true)));
    return fatos;
  }

  const itens = linhas
    .map((l) => ({ rotulo: String(l[dim]), valor: num(l[idMetrica]), valor2: idMetrica2 ? num(l[idMetrica2]) : null }))
    .filter((i): i is { rotulo: string; valor: number; valor2: number | null } => i.valor !== null);
  if (!itens.length) return fatos;

  // Duas métricas por categoria: correlação.
  const metrica2 = idMetrica2 ? semantica.metrics[idMetrica2] : undefined;
  if (metrica2 && idMetrica2) {
    const pares = itens.filter((i) => i.valor2 !== null);
    const r = correlacao(pares.map((p) => p.valor), pares.map((p) => p.valor2 ?? 0));
    fatos.push({ id: 'correlacao', tipo: 'correlacao', rotulo: `${metrica.label} × ${metrica2.label}`, valor: r, valor_formatado: formatar(r, 'dec2'), importancia: 0.7 });
  }

  const primeiro = itens[0];
  if (primeiro) fatos.push(fato('primeiro', 'lider', primeiro.rotulo, primeiro.valor, fmt, 1));
  const maior = itens.reduce((a, b) => (b.valor > a.valor ? b : a));
  const menor = itens.reduce((a, b) => (b.valor < a.valor ? b : a));
  fatos.push(fato('maior', 'maximo', maior.rotulo, maior.valor, fmt, 0.7));
  if (itens.length > 1) fatos.push(fato('menor', 'minimo', menor.rotulo, menor.valor, fmt, 0.6));

  // Participação e concentração: só para métricas que somam.
  const total = entrada.total ?? null;
  if (metrica.empty_is_zero && total && total > 0 && primeiro) {
    fatos.push(fato('total', 'total', 'total', total, fmt, 0.5));
    fatos.push(fato('primeiro_share', 'participacao', primeiro.rotulo, primeiro.valor / total, 'pct', 0.9));
    if (itens.length >= 4 && spec.sort?.dir !== 'asc') {
      const top3 = itens.slice(0, 3);
      const soma = top3.reduce((s, i) => s + i.valor, 0);
      fatos.push({ ...fato('top3_share', 'concentracao', top3.map((i) => i.rotulo).join(', '), soma / total, 'pct', 0.8) });
    }
  }

  // Diferença entre o maior e o menor grupo (comparações curtas: atrasado vs no prazo).
  if (itens.length >= 2 && itens.length <= 8 && maior.rotulo !== menor.rotulo) {
    const dif = maior.valor - menor.valor;
    fatos.push(fato('diferenca', 'diferenca', `${maior.rotulo} − ${menor.rotulo}`, dif, fmt, 0.85));
    if (menor.valor) fatos.push(fato('diferenca_pct', 'diferenca', `${maior.rotulo} vs ${menor.rotulo}`, maior.valor / menor.valor - 1, 'pct', 0.6, true));
  }

  outliers(itens.map((i) => i.valor))
    .slice(0, 2)
    .forEach((idx, k) => {
      const item = itens[idx];
      if (item) fatos.push(fato(`outlier_${k + 1}`, 'outlier', item.rotulo, item.valor, fmt, 0.55));
    });

  return fatos;
}

export function buscarFato(fatos: readonly Fato[], id: string): Fato | undefined {
  return fatos.find((f) => f.id === id);
}
