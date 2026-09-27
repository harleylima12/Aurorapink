/**
 * Contas sobre as linhas que o DuckDB devolveu, para os gráficos por tema (Fase 5C): participação acumulada da
 * curva ABC, média móvel, soma corrida, etapas de um funil e faixas de histograma. Puras e testadas
 * (tests/unit/especiais.test.ts); sem ECharts, para a camada de receitas poder usar também.
 */
import { formatar } from '../format/numeros';
import type { Formato } from '../semantic/schema';

/** Curva ABC: participação acumulada e classe (A até 80% do total, B até 95%, C o resto). Entrada já em ordem desc. */
export function classesAbc(valores: readonly (number | null)[]): { acumulado: number; classe: 'A' | 'B' | 'C' }[] {
  const total = valores.reduce<number>((s, v) => s + Math.max(0, v ?? 0), 0);
  let soma = 0;
  return valores.map((v) => {
    const antes = total ? soma / total : 0;
    soma += Math.max(0, v ?? 0);
    const classe = antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C';
    return { acumulado: total ? soma / total : 0, classe };
  });
}

/** Média móvel de `janela` pontos (só quando há pontos suficientes; antes disso, vazio). */
export function mediaMovel(valores: readonly (number | null)[], janela = 3): (number | null)[] {
  return valores.map((_, i) => {
    if (i + 1 < janela) return null;
    const trecho = valores.slice(i + 1 - janela, i + 1);
    if (trecho.some((v) => v === null)) return null;
    return (trecho as number[]).reduce((s, v) => s + v, 0) / janela;
  });
}

/** Soma corrida (vazio conta como zero). */
export function somaCorrida(valores: readonly (number | null)[]): number[] {
  let s = 0;
  return valores.map((v) => (s += v ?? 0));
}

/**
 * Etapas conhecidas de processos (vendas, projetos, pedidos, leads), em ordem. Quem tem a mesma posição é
 * a mesma etapa com outro nome. Status "de saída" (cancelado, perdido) ficam fora do funil e são citados.
 */
const ETAPAS: Readonly<Record<string, number>> = {
  lead: 1, novo: 1, contato: 2, 'em contato': 2, qualificado: 3, orcamento: 3, 'orcamento enviado': 3, proposta: 4, 'proposta enviada': 4,
  negociacao: 5, 'em negociacao': 5, aprovado: 6, fechado: 6, pago: 6, 'aguardando pagamento': 5, 'em separacao': 7, 'em producao': 7,
  'em desenvolvimento': 7, desenvolvimento: 7, 'em andamento': 7, enviado: 8, 'em transito': 8, 'em revisao': 8, entregue: 9, publicado: 9,
  concluido: 10, finalizado: 10, convertido: 10, ganho: 10, cliente: 10,
};
const SAIDA = new Set(['cancelado', 'perdido', 'devolvido', 'recusado', 'desistiu', 'descartado']);
const normal = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Os valores do status formam um funil? Precisa de 3 ou mais etapas conhecidas (senão, null). */
export function etapasDoStatus(valores: readonly string[]): { ordem: string[]; fora: string[] } | null {
  const conhecidos = valores.filter((v) => ETAPAS[normal(v)] !== undefined);
  const posicoes = new Set(conhecidos.map((v) => ETAPAS[normal(v)]));
  if (posicoes.size < 3) return null;
  const ordem = [...conhecidos].sort((a, b) => ETAPAS[normal(a)]! - ETAPAS[normal(b)]! || a.localeCompare(b));
  return { ordem, fora: valores.filter((v) => ETAPAS[normal(v)] === undefined && SAIDA.has(normal(v))) };
}

/** Quantos chegaram a cada etapa: quem está numa etapa passou por todas as anteriores (processo em linha). */
export function funilAcumulado(contagens: readonly { valor: string; n: number }[], ordem: readonly string[]): { etapa: string; n: number }[] {
  const posicao = (v: string) => ETAPAS[normal(v)] ?? 0;
  const etapas = [...new Set(ordem.map(posicao))].sort((a, b) => a - b);
  const rotulo = (p: number) => ordem.filter((v) => posicao(v) === p).join(' / ');
  return etapas.map((p) => ({ etapa: rotulo(p), n: contagens.filter((c) => posicao(c.valor) >= p && ordem.includes(c.valor)).reduce((s, c) => s + c.n, 0) }));
}

/** Faixas "redondas" para histograma, entre os percentis 2 e 98 (fora disso, cai na primeira/última faixa). */
export function faixasHistograma(p02: number, p98: number, formato: Formato, alvo = 8): { label: string; max: number | null }[] {
  if (!Number.isFinite(p02) || !Number.isFinite(p98) || p98 <= p02) return [];
  const bruto = (p98 - p02) / alvo;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((x) => x >= bruto) ?? bruto;
  const inicio = Math.floor(p02 / passo) * passo;
  const faixas: { label: string; max: number | null }[] = [];
  const f = (v: number) => formatar(v, formato === 'pct' ? 'pct' : formato === 'brl' ? 'brl' : 'dec1', { compacto: true });
  faixas.push({ label: `< ${f(inicio + passo)}`, max: inicio + passo });
  let de = inicio + passo;
  while (de + passo < p98 && faixas.length < alvo + 3) {
    faixas.push({ label: `${f(de)}–${f(de + passo)}`, max: de + passo });
    de += passo;
  }
  faixas.push({ label: `≥ ${f(de)}`, max: null });
  return faixas;
}

