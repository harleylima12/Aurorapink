/**
 * Aplica a receita do tema (Fase 5B). Duas etapas, ambas funções puras:
 *   1. planejarTema: antes da tabela tipada. Troca {papel} pelo nome real da coluna nas métricas da receita
 *      (viram métricas EXTRAS da semântica), põe o eixo do tempo na coluna certa e transforma em dimensão as
 *      colunas que as seções usam.
 *   2. painelDoTema: depois da semântica. Monta KPIs e seções na ordem do objetivo, corta pelo público, e lista
 *      o que ficou escondido e por quê ("não achei a coluna do produto"). Nada é inventado: sem coluna, sem painel.
 */
import type { DefinicaoVisual } from '../../dashboard/paginas';
import type { QuerySpec } from '../../query/spec';
import type { Metrica, Semantica } from '../../semantic/schema';
import { normalizar } from '../../router/normalizar';
import { ident } from '../limpeza';
import { montarPainel, type PainelPlanilha } from '../painelAuto';
import type { ColunaConfig, TipoColuna } from '../perfil';
import { DEF_PAPEIS, DEF_TEMAS, type PapelNegocio, type Tema } from './definicoes';
import { lista } from './detector';
import type { Papeis } from './papeis';
import { receitaDe, type MetricaReceita, type Receita, type SecaoReceita } from './receitas';

export const PUBLICOS = ['gestor', 'equipe', 'cliente'] as const;
export type Publico = (typeof PUBLICOS)[number];
export const ROTULO_PUBLICO: Record<Publico, string> = { gestor: 'Gestor', equipe: 'Equipe', cliente: 'Cliente' };
export const EXPLICA_PUBLICO: Record<Publico, string> = {
  gestor: 'os 4 painéis principais, sem tabela linha a linha',
  equipe: 'todos os painéis e a tabela de detalhe',
  cliente: 'só 3 painéis, sem dados internos (vendedor, custos) e sem tabela',
};
const MAX_SECOES: Record<Publico, number> = { gestor: 4, equipe: 8, cliente: 3 };

export interface EscolhaTema {
  tema: Tema;
  objetivo?: string;
  publico?: Publico;
  /** Papel -> id da coluna ("" = o usuário disse que não tem). */
  papeis: Papeis;
}

export interface MetricaResolvida {
  id: string;
  rotulo: string;
  sql: string;
  formato: Metrica['format'];
}

export interface PlanoTema {
  config: ColunaConfig[];
  metricasExtras: Record<string, Metrica>;
  /** Id da receita -> métrica montada; ausentes -> papéis que faltaram. */
  resolvidas: Record<string, MetricaResolvida>;
  faltando: Record<string, PapelNegocio[]>;
}

export const idMetricaTema = (id: string) => (id === 'registros' ? 'registros' : `t_${id}`);

const papeisDoSql = (sql: string) => [...sql.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1] as PapelNegocio);

/** "(h)" de "Tempo de Resposta (h)". */
function unidade(original: string | undefined): string {
  const m = original?.match(/\(([^)]{1,8})\)\s*$/);
  return m && !/^r\$$/i.test(m[1]!) ? ` (${m[1]})` : '';
}

const coluna = (papeis: Papeis, p: PapelNegocio) => (papeis[p] ? papeis[p] : undefined);

export function resolverMetrica(m: MetricaReceita, papeis: Papeis, config: readonly ColunaConfig[]): MetricaResolvida | { faltam: PapelNegocio[] } {
  const tipoDe = (p: PapelNegocio): TipoColuna | undefined => config.find((c) => c.id === coluna(papeis, p))?.tipo;
  let faltam: PapelNegocio[] | undefined;
  let naoSeAplica = false;
  for (const alt of m.alternativas) {
    // "Só sem entrada/saída": se a planilha tem, esta conta não se aplica (e não é falta de coluna).
    if (alt.seNaoHouver?.some((p) => coluna(papeis, p))) {
      naoSeAplica = true;
      continue;
    }
    const usados = papeisDoSql(alt.sql);
    const sem = usados.filter((p) => !coluna(papeis, p));
    if (sem.length) {
      faltam ??= sem;
      continue;
    }
    if (alt.seTipo && Object.entries(alt.seTipo).some(([p, tipos]) => !tipos.includes(tipoDe(p as PapelNegocio)!))) continue;
    const sql = alt.sql.replace(/\{([a-z_]+)\}/g, (_, p: PapelNegocio) => ident(coluna(papeis, p)!));
    const rotulo = (alt.rotulo ?? m.rotulo).replace(/\{u:([a-z_]+)\}/g, (_, p: PapelNegocio) => unidade(config.find((c) => c.id === coluna(papeis, p))?.original));
    return { id: idMetricaTema(m.id), rotulo, sql, formato: alt.formato ?? m.formato };
  }
  return { faltam: naoSeAplica ? [] : (faltam ?? []) };
}

/** Colunas que não podem virar dimensão (P6 e privacidade). */
const podeSerDimensao = (c: ColunaConfig) => c.tipo !== 'texto' && c.tipo !== 'pessoal' && c.tipo !== 'data';

export function planejarTema(escolha: EscolhaTema, config: readonly ColunaConfig[]): PlanoTema | null {
  const receita = receitaDe(escolha.tema);
  if (!receita) return null;
  const papeis = escolha.papeis;

  // Eixo do tempo: o 1º papel de tempo da receita que tem coluna.
  const tempoPapel = receita.tempo.find((p) => coluna(papeis, p));
  const tempoCol = tempoPapel ? coluna(papeis, tempoPapel) : undefined;
  // Dimensões usadas pelas seções.
  const dims = new Set(receita.secoes.flatMap((s) => (s.dimensao !== 'tempo' && coluna(papeis, s.dimensao) ? [coluna(papeis, s.dimensao)!] : [])));
  const novaConfig = config.map((c): ColunaConfig => {
    if (tempoCol) {
      if (c.id === tempoCol && c.tipo === 'data') return { ...c, papel: 'tempo' };
      if (c.papel === 'tempo') return { ...c, papel: 'ignorar' };
    }
    if (dims.has(c.id) && c.papel !== 'dimensao' && podeSerDimensao(c)) {
      const { agregacao: _sem, ...resto } = c;
      return { ...resto, papel: 'dimensao' };
    }
    return c;
  });

  const resolvidas: Record<string, MetricaResolvida> = {};
  const faltando: Record<string, PapelNegocio[]> = {};
  const metricasExtras: Record<string, Metrica> = {};
  for (const m of receita.metricas) {
    const r = resolverMetrica(m, papeis, novaConfig);
    if ('faltam' in r) {
      faltando[m.id] = r.faltam;
      continue;
    }
    resolvidas[m.id] = r;
    const nomes = [normalizar(r.rotulo), ...m.sinonimos];
    metricasExtras[r.id] = {
      label: r.rotulo,
      sql: r.sql,
      format: r.formato,
      grain: 'item',
      empty_is_zero: m.zeroSeVazio,
      polarity: m.polaridade,
      synonyms: [...new Set(nomes)],
      description: `${m.descricao} (receita do tema ${DEF_TEMAS[escolha.tema].rotulo})`,
    };
  }
  return { config: novaConfig, metricasExtras, resolvidas, faltando };
}

export interface Escondido {
  /** Títulos dos painéis escondidos pelo mesmo motivo. */
  titulos: string[];
  motivo: string;
}

export interface PainelTema extends PainelPlanilha {
  tema: Tema;
  objetivo?: { id: string; rotulo: string };
  publico: Publico;
  /** Só os painéis do OBJETIVO escolhido que ficaram de fora, agrupados pelo motivo. */
  escondidos: Escondido[];
  /** Quantos painéis ficaram de fora só por causa do público (não por falta de coluna). */
  cortadosPeloPublico: number;
  mostrarDetalhe: boolean;
  perguntas: string[];
  insights: DefinicaoVisual[];
}

const base = { filters: [] } satisfies Pick<QuerySpec, 'filters'>;
const minusculo = (t: string) => (/^[A-Z0-9]{2,}\b/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
const rotuloPapel = (p: PapelNegocio) => DEF_PAPEIS[p].rotulo;

function dimensaoDaColuna(semantica: Semantica, col: string | undefined): string | undefined {
  if (!col) return undefined;
  return Object.entries(semantica.dimensions).find(([, d]) => d.type === 'categoria' && 'column' in d && d.column === col)?.[0];
}

/** Rótulo da métrica da receita: o montado, se existe; senão o da receita (sem marcadores). */
function rotuloMetricaReceita(receita: Receita, plano: PlanoTema, id: string): string {
  if (id === 'registros') return 'Registros';
  return plano.resolvidas[id]?.rotulo ?? receita.metricas.find((m) => m.id === id)?.rotulo.replace(/\{u:[a-z_]+\}/g, '') ?? id;
}

/**
 * A seção dá para montar? Só com o plano (antes da semântica): serve para a tela de perguntas e para o painel.
 * `silencioso`: não faz sentido nesta planilha (ex.: "total lançado" quando há entrada/saída) e não precisa explicar.
 */
export function avaliarSecao(
  s: SecaoReceita,
  plano: PlanoTema,
  papeis: Papeis,
): { ok: true } | { ok: false; motivo: string; silencioso?: boolean } {
  if (s.metrica !== 'registros' && !plano.resolvidas[s.metrica]) {
    const faltam = plano.faltando[s.metrica] ?? [];
    return faltam.length ? { ok: false, motivo: `não achei a coluna de ${lista(faltam.map(rotuloPapel))}` } : { ok: false, motivo: '', silencioso: true };
  }
  if (s.dimensao === 'tempo') {
    const tempoCol = plano.config.find((c) => c.papel === 'tempo')?.id;
    if (!tempoCol) return { ok: false, motivo: 'a planilha não tem coluna de data' };
    if (s.tempoPapel && coluna(papeis, s.tempoPapel) !== tempoCol) return { ok: false, motivo: '', silencioso: true };
    return { ok: true };
  }
  const col = coluna(papeis, s.dimensao);
  if (!col) return { ok: false, motivo: `não achei a coluna de ${rotuloPapel(s.dimensao)}` };
  const c = plano.config.find((x) => x.id === col);
  if (c && !podeSerDimensao(c)) return { ok: false, motivo: `a coluna "${c.rotulo}" é ${c.tipo === 'pessoal' ? 'dado pessoal' : 'texto livre'} e não vira gráfico` };
  return { ok: true };
}

/** Objetivos com quantos painéis de cada um dá para montar; o padrão é o que tem mais (empate: o 1º da receita). */
export function objetivosPossiveis(tema: Tema, plano: PlanoTema, papeis: Papeis): { id: string; rotulo: string; paineis: number }[] {
  const receita = receitaDe(tema);
  if (!receita) return [];
  return receita.objetivos.map((o) => ({
    id: o.id,
    rotulo: o.rotulo,
    paineis: o.secoes.filter((id) => avaliarSecao(receita.secoes.find((x) => x.id === id)!, plano, papeis).ok).length,
  }));
}

export function objetivoPadrao(tema: Tema, plano: PlanoTema, papeis: Papeis): string | undefined {
  const possiveis = objetivosPossiveis(tema, plano, papeis);
  return possiveis.reduce<(typeof possiveis)[number] | undefined>((melhor, o) => (!melhor || o.paineis > melhor.paineis ? o : melhor), undefined)?.id;
}

export function painelDoTema(
  escolha: EscolhaTema,
  plano: PlanoTema,
  semantica: Semantica,
  config: readonly ColunaConfig[],
  distintos: Readonly<Record<string, number>>,
): PainelTema {
  const receita = receitaDe(escolha.tema) as Receita;
  const publico = escolha.publico ?? 'equipe';
  const papeis = escolha.papeis;
  const idObjetivo = escolha.objetivo ?? objetivoPadrao(escolha.tema, plano, papeis);
  const objetivo = receita.objetivos.find((o) => o.id === idObjetivo) ?? receita.objetivos[0]!;
  const tempo = semantica.dimensions.tempo;
  const temMetrica = (id: string) => id === 'registros' || Boolean(plano.resolvidas[id] && semantica.metrics[idMetricaTema(id)]);
  const rotuloMetrica = (id: string) => semantica.metrics[idMetricaTema(id)]?.label ?? rotuloMetricaReceita(receita, plano, id);
  const motivos = new Map<string, string[]>();
  const esconder = (s: SecaoReceita, titulo: string, motivo: string) => {
    // Só explica o que o usuário pediu (as seções do objetivo); o resto da receita some calado.
    if (objetivo.secoes.includes(s.id)) motivos.set(motivo, [...(motivos.get(motivo) ?? []), titulo]);
  };

  // KPIs: os do objetivo primeiro, depois os da receita; só os que existem.
  const kpis: string[] = [];
  for (const id of [...(objetivo.kpis ?? []), ...receita.kpis]) if (!kpis.includes(id) && temMetrica(id) && kpis.length < 4) kpis.push(id);

  // Seções: a ordem do objetivo, depois as outras da receita.
  const ordem = [...objetivo.secoes, ...receita.secoes.map((s) => s.id).filter((id) => !objetivo.secoes.includes(id))];
  const disponiveis: { secao: SecaoReceita; visual: DefinicaoVisual }[] = [];
  for (const id of ordem) {
    const s = receita.secoes.find((x) => x.id === id)!;
    const titulo = tituloSecao(s, rotuloMetrica(s.metrica), s.dimensao === 'tempo' ? '' : rotuloPapel(s.dimensao));
    const av = avaliarSecao(s, plano, papeis);
    if (!av.ok) {
      if (!av.silencioso) esconder(s, titulo, av.motivo);
      continue;
    }
    const metrica = idMetricaTema(s.metrica);
    if (!semantica.metrics[metrica]) continue;
    if (s.dimensao === 'tempo') {
      if (!tempo) {
        esconder(s, titulo, 'a coluna de data não tem datas válidas');
        continue;
      }
      disponiveis.push({
        secao: s,
        visual: {
          id: `tema-${s.id}`,
          titulo,
          subtitulo: `${s.explicacao} · por mês, pela coluna "${tempo.label}"`,
          tipo: 'linha',
          largo: true,
          spec: { ...base, intent: 'tendencia', metrics: [metrica], dimensions: ['tempo'], time: { grain: 'mes' } },
        },
      });
      continue;
    }
    const col = coluna(papeis, s.dimensao);
    const dim = dimensaoDaColuna(semantica, col);
    if (!dim) {
      esconder(s, titulo, `a coluna de ${rotuloPapel(s.dimensao)} não pôde virar categoria`);
      continue;
    }
    const n = col ? (distintos[col] ?? 0) : 0;
    const poucos = n > 0 && n <= 8;
    const rotuloDim = semantica.dimensions[dim]?.label ?? dim;
    disponiveis.push({
      secao: s,
      visual: {
        id: `tema-${s.id}`,
        titulo: tituloSecao(s, rotuloMetrica(s.metrica), rotuloDim),
        subtitulo: `${s.explicacao} · ${poucos ? `os ${n} valores de "${rotuloDim}"` : `top ${s.limite} de "${rotuloDim}"${n ? ` (${n} valores)` : ''}`}`,
        tipo: poucos ? 'coluna' : 'barra',
        spec: poucos
          ? { ...base, intent: 'comparacao', metrics: [metrica], dimensions: [dim] }
          : { ...base, intent: 'ranking', metrics: [metrica], dimensions: [dim], limit: s.limite, sort: { by: metrica, dir: 'desc' } },
      },
    });
  }
  const escondidos = [...motivos].map(([motivo, titulos]) => ({ motivo, titulos }));

  const doPublico = disponiveis.filter((d) => !(publico === 'cliente' && d.secao.interno));
  const visiveis = doPublico.slice(0, MAX_SECOES[publico]);
  const cortadosPeloPublico = disponiveis.length - visiveis.length;
  const visuais = visiveis.map((d) => d.visual);
  const insights = disponiveis.filter((d) => receita.insights.includes(d.secao.id)).map((d) => d.visual);
  const dimensoes = [...new Set(visuais.flatMap((v) => v.spec.dimensions.filter((d) => d !== 'tempo')))];
  const principal = idMetricaTema(kpis[0] ?? 'registros');

  if (!visuais.length && kpis.length <= 1) {
    // A receita não achou quase nada: volta ao painel automático, e a tela diz por quê.
    const auto = montarPainel(semantica, config, distintos);
    return {
      ...auto,
      tema: escolha.tema,
      objetivo: { id: objetivo.id, rotulo: objetivo.rotulo },
      publico,
      escondidos: [{ titulos: [`Painel de ${DEF_TEMAS[escolha.tema].rotulo}`], motivo: 'faltaram as colunas principais do tema; mostrei o painel automático' }, ...escondidos],
      cortadosPeloPublico: 0,
      mostrarDetalhe: publico === 'equipe',
      perguntas: [],
      insights: auto.visuais,
    };
  }

  return {
    kpis: kpis.map((k) => ({ metrica: idMetricaTema(k) })),
    visuais,
    principal,
    dimensoes,
    tema: escolha.tema,
    objetivo: { id: objetivo.id, rotulo: objetivo.rotulo },
    publico,
    escondidos,
    cortadosPeloPublico,
    mostrarDetalhe: publico === 'equipe',
    perguntas: perguntasDoTema(receita, semantica, papeis),
    insights: insights.length ? insights : visuais,
  };
}

function tituloSecao(s: SecaoReceita, metrica: string, dim: string): string {
  const t = s.titulo.replace('{m}', metrica).replace('{d}', minusculo(dim));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Perguntas da receita com os rótulos reais; some a que depende de coluna que não existe. */
export function perguntasDoTema(receita: Receita, semantica: Semantica, papeis: Papeis): string[] {
  const saida: string[] = [];
  for (const q of receita.perguntas) {
    let ok = true;
    const texto = q
      .replace(/\{m:([a-z_]+)\}/g, (_, id: string) => {
        const m = semantica.metrics[idMetricaTema(id)];
        if (!m) ok = false;
        return m ? minusculo(m.label) : '';
      })
      .replace(/\{d:([a-z_]+)\}/g, (_, p: PapelNegocio) => {
        const dim = dimensaoDaColuna(semantica, coluna(papeis, p));
        if (!dim) ok = false;
        return dim ? minusculo(semantica.dimensions[dim]!.label) : '';
      })
      .replace('{tempo}', () => {
        if (!semantica.dimensions.tempo) ok = false;
        return 'mês a mês';
      });
    if (ok) saida.push(texto.charAt(0).toUpperCase() + texto.slice(1));
  }
  return saida.slice(0, 5);
}
