/**
 * Aplica a receita do tema (Fases 5B e 5C). Duas etapas, ambas funções puras:
 *   1. planejarTema: antes da tabela tipada. Troca {papel} pelo nome real da coluna nas métricas da receita
 *      (viram métricas EXTRAS da semântica), põe o eixo do tempo na coluna certa, transforma em dimensão as
 *      colunas que as seções usam e cria as dimensões derivadas (dia da semana, mês, hora).
 *   2. painelDoTema: depois da semântica. Monta KPIs e seções na ordem do objetivo, escolhe a FORMA de cada
 *      gráfico pelos dados (funil só se o status tiver etapas; mapa de hora só se a data tiver hora…), põe o
 *      gráfico principal do objetivo no topo, corta pelo público e lista o que ficou de fora e por quê.
 *      Nada é inventado: sem coluna, sem painel; sem o papel da forma especial, gráfico simples + explicação.
 */
import { etapasDoStatus } from '../../charts/contas';
import type { DefinicaoVisual } from '../../dashboard/paginas';
import type { QuerySpec } from '../../query/spec';
import type { Dimensao, Metrica, Semantica } from '../../semantic/schema';
import { normalizar } from '../../router/normalizar';
import { ident } from '../limpeza';
import { montarPainel, type PainelPlanilha } from '../painelAuto';
import type { ColunaConfig, TipoColuna } from '../perfil';
import { colunaHora, temHora } from '../semanticaAuto';
import { DEF_PAPEIS, DEF_TEMAS, type PapelNegocio, type Tema } from './definicoes';
import { lista } from './detector';
import type { Papeis } from './papeis';
import { receitaDe, type Forma, type MetricaReceita, type Receita, type SecaoReceita } from './receitas';

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
  /** Papel -> id da coluna, já resolvido (automático + escolhas do usuário). */
  papeis: Papeis;
  /** Só as escolhas feitas à mão ("" = o usuário disse que não tem). Isto é o que fica salvo no modelo. */
  fixos?: Papeis;
  /** Perguntas sugeridas pela IA local (Camada 1); respondidas pelo caminho normal (Camada 0/planejador). */
  perguntasIA?: string[];
  /** O tema veio da IA local (a Camada 0 não tinha confiança alta). */
  temaDaIA?: boolean;
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
  /** Dia da semana, mês e hora da coluna de tempo (Fase 5C). */
  dimensoesExtras: Record<string, Dimensao>;
  /** Id da receita -> métrica montada; ausentes -> papéis que faltaram. */
  resolvidas: Record<string, MetricaResolvida>;
  faltando: Record<string, PapelNegocio[]>;
  /** Até 12 valores de cada coluna (do perfil): dizem se um status tem etapas de funil. */
  amostras: Readonly<Record<string, readonly string[]>>;
  /** Colunas numéricas com histograma: as faixas saem dos percentis, calculados depois (montar.ts). */
  histogramas: string[];
}

export const idMetricaTema = (id: string) => (id === 'registros' ? 'registros' : `t_${id}`);
export const idSemana = (col: string) => `sem_${col}`;
export const idMes = (col: string) => `mes_${col}`;
export const idHora = (col: string) => `hor_${col}`;
export const idFaixa = (col: string) => `fx_${col}`;

/** Marcadores que NÃO são papel: {sla} = limite de SLA pela unidade da coluna de tempo de resposta. */
const MARCADORES_ESPECIAIS = new Set(['sla']);
const papeisDoSql = (sql: string) => [...sql.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]!).filter((p) => !MARCADORES_ESPECIAIS.has(p)) as PapelNegocio[];

/** "(h)" de "Tempo de Resposta (h)". */
function unidadeCrua(original: string | undefined): string | undefined {
  const m = original?.match(/\(([^)]{1,8})\)\s*$/);
  return m && !/^r\$$/i.test(m[1]!) ? m[1]!.toLowerCase() : undefined;
}
const unidade = (original: string | undefined) => {
  const u = original?.match(/\(([^)]{1,8})\)\s*$/)?.[1];
  return u && !/^r\$$/i.test(u) ? ` (${u})` : '';
};

/** Meta de SLA ASSUMIDA pela unidade da coluna (aparece escrita no painel): 24 h ou 240 min (4 h). */
export const SLA_POR_UNIDADE: Readonly<Record<string, { valor: number; texto: string }>> = {
  h: { valor: 24, texto: '24 h' },
  horas: { valor: 24, texto: '24 h' },
  min: { valor: 240, texto: '4 h (240 min)' },
  minutos: { valor: 240, texto: '4 h (240 min)' },
};

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
    // {sla}: só quando a unidade do tempo de resposta é conhecida (h ou min); senão a conta não vale.
    const sla = alt.sql.includes('{sla}') ? SLA_POR_UNIDADE[unidadeCrua(config.find((c) => c.id === coluna(papeis, 'tempo_resposta'))?.original) ?? ''] : undefined;
    if (alt.sql.includes('{sla}') && !sla) {
      naoSeAplica = true;
      continue;
    }
    const sql = alt.sql.replace(/\{([a-z_]+)\}/g, (_, p: string) => (p === 'sla' ? String(sla!.valor) : ident(coluna(papeis, p as PapelNegocio)!)));
    const rotulo = (alt.rotulo ?? m.rotulo)
      .replace(/\{u:([a-z_]+)\}/g, (_, p: PapelNegocio) => unidade(config.find((c) => c.id === coluna(papeis, p))?.original))
      .replace('{sla}', sla?.texto ?? '');
    return { id: idMetricaTema(m.id), rotulo, sql, formato: alt.formato ?? m.formato };
  }
  return { faltam: naoSeAplica ? [] : (faltam ?? []) };
}

/** Colunas que não podem virar dimensão (P6 e privacidade). */
const podeSerDimensao = (c: ColunaConfig) => c.tipo !== 'texto' && c.tipo !== 'pessoal' && c.tipo !== 'data';
const NUMERICOS: readonly TipoColuna[] = ['dinheiro', 'numero', 'porcentagem'];

const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const HORAS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}h`);
const caso = (expr: string, rotulos: string[]) => `CASE ${expr} ${rotulos.map((r, i) => `WHEN ${i + 1} THEN '${r}'`).join(' ')} END`;

/** Dia da semana, mês do ano e (se a data tem hora) hora da coluna de tempo, como dimensões com ordem fixa. */
export function dimensoesDoTempo(tempo: ColunaConfig): Record<string, Dimensao> {
  const c = ident(tempo.id);
  const dims: Record<string, Dimensao> = {
    [idSemana(tempo.id)]: { type: 'categoria', label: 'Dia da semana', sql: caso(`isodow(${c})`, SEMANA), order: SEMANA, synonyms: ['dia da semana'] },
    [idMes(tempo.id)]: { type: 'categoria', label: 'Mês do ano', sql: caso(`month(${c})`, MESES), order: MESES, synonyms: ['mes do ano'] },
  };
  if (temHora(tempo)) {
    dims[idHora(tempo.id)] = {
      type: 'categoria',
      label: 'Hora',
      sql: `lpad(CAST(${ident(colunaHora(tempo.id))} AS VARCHAR), 2, '0') || 'h'`,
      order: HORAS,
      synonyms: ['hora', 'horario'],
    };
  }
  return dims;
}

export function planejarTema(escolha: EscolhaTema, config: readonly ColunaConfig[], amostras: Readonly<Record<string, readonly string[]>> = {}): PlanoTema | null {
  const receita = receitaDe(escolha.tema);
  if (!receita) return null;
  const papeis = escolha.papeis;

  // Eixo do tempo: o 1º papel de tempo da receita que tem coluna.
  const tempoPapel = receita.tempo.find((p) => coluna(papeis, p));
  const tempoCol = tempoPapel ? coluna(papeis, tempoPapel) : undefined;
  // Dimensões usadas pelas seções (histograma usa a coluna como NÚMERO: não vira dimensão).
  const dims = new Set(
    receita.secoes.flatMap((s) => {
      const d = s.forma !== 'histograma' && s.dimensao !== 'tempo' && s.dimensao !== 'nenhuma' ? [coluna(papeis, s.dimensao)] : [];
      return [...d, s.dimensao2 ? coluna(papeis, s.dimensao2) : undefined].filter((x): x is string => Boolean(x));
    }),
  );
  const histogramas = [
    ...new Set(receita.secoes.flatMap((s) => (s.forma === 'histograma' && s.dimensao !== 'tempo' && s.dimensao !== 'nenhuma' && coluna(papeis, s.dimensao) ? [coluna(papeis, s.dimensao)!] : []))),
  ].filter((id) => NUMERICOS.includes(config.find((c) => c.id === id)?.tipo ?? 'texto'));
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
      description: m.descricao,
    };
  }
  const tempo = novaConfig.find((c) => c.papel === 'tempo');
  return { config: novaConfig, metricasExtras, dimensoesExtras: tempo ? dimensoesDoTempo(tempo) : {}, resolvidas, faltando, amostras, histogramas };
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
  /** Estilo dos KPIs do tema (Fase 5C). */
  layoutKpis: Receita['layout']['kpis'];
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
  return plano.resolvidas[id]?.rotulo ?? receita.metricas.find((m) => m.id === id)?.rotulo.replace(/\{u:[a-z_]+\}|\{sla\}/g, '') ?? id;
}

export type Avaliacao = { ok: true; forma: Forma; nota?: string } | { ok: false; motivo: string; silencioso?: boolean };

/**
 * A seção dá para montar, e com qual FORMA? Só com o plano (antes da semântica): serve para a tela de perguntas e
 * para o painel. Forma especial sem o papel que ela exige vira o gráfico simples, com `nota` explicando (plano B).
 * `silencioso`: não faz sentido nesta planilha (ex.: "total lançado" quando há entrada/saída) e não precisa explicar.
 */
export function avaliarSecao(s: SecaoReceita, plano: PlanoTema, papeis: Papeis): Avaliacao {
  const metricaOk = (id: string) => id === 'registros' || Boolean(plano.resolvidas[id]);
  if (!metricaOk(s.metrica)) {
    const faltam = plano.faltando[s.metrica] ?? [];
    return faltam.length ? { ok: false, motivo: `não achei a coluna de ${lista(faltam.map(rotuloPapel))}` } : { ok: false, motivo: '', silencioso: true };
  }
  let forma: Forma = s.forma;
  let nota: string | undefined;
  const planoB = (motivo: string) => {
    forma = 'auto';
    nota ??= motivo;
  };
  const extrasFaltando = s.metricas.filter((m) => !metricaOk(m));
  if (extrasFaltando.length) {
    const faltam = [...new Set(extrasFaltando.flatMap((m) => plano.faltando[m] ?? []))];
    const motivo = faltam.length ? `sem a coluna de ${lista(faltam.map(rotuloPapel))}` : 'uma das contas não se aplica a esta planilha';
    if (s.dimensao === 'nenhuma') return { ok: false, motivo: faltam.length ? `não achei a coluna de ${lista(faltam.map(rotuloPapel))}` : motivo, silencioso: !faltam.length };
    planoB(`${motivo}: mostrei o gráfico simples`);
  }
  if (s.dimensao === 'nenhuma') return { ok: true, forma, nota };

  if (s.dimensao === 'tempo') {
    const tempo = plano.config.find((c) => c.papel === 'tempo');
    if (!tempo) return { ok: false, motivo: 'a planilha não tem coluna de data' };
    if (s.tempoPapel && coluna(papeis, s.tempoPapel) !== tempo.id) return { ok: false, motivo: '', silencioso: true };
    if (forma === 'heatmap_semana_hora' && !temHora(tempo)) {
      forma = 'heatmap_semana_mes';
      nota = `a coluna "${tempo.rotulo}" não tem hora: mostrei dia da semana × mês`;
    }
    return { ok: true, forma, nota };
  }

  const col = coluna(papeis, s.dimensao);
  if (!col) return { ok: false, motivo: `não achei a coluna de ${rotuloPapel(s.dimensao)}` };
  const c = plano.config.find((x) => x.id === col);
  if (forma === 'histograma') {
    if (!c || !NUMERICOS.includes(c.tipo)) return { ok: false, motivo: `a coluna de ${rotuloPapel(s.dimensao)} não é numérica` };
    return { ok: true, forma };
  }
  if (c && !podeSerDimensao(c)) return { ok: false, motivo: `a coluna "${c.rotulo}" é ${c.tipo === 'pessoal' ? 'dado pessoal' : 'texto livre'} e não vira gráfico` };
  if (s.dimensao2 && forma !== 'auto') {
    const c2 = coluna(papeis, s.dimensao2);
    const cfg2 = plano.config.find((x) => x.id === c2);
    if (!c2 || (cfg2 && !podeSerDimensao(cfg2))) planoB(`sem a coluna de ${rotuloPapel(s.dimensao2)}: mostrei só por ${rotuloPapel(s.dimensao)}`);
  }
  if (forma === 'funil_etapas' && !etapasDoStatus(plano.amostras[col] ?? [])) {
    planoB(`os valores de "${c?.rotulo ?? col}" não parecem etapas de um processo: mostrei a contagem de cada um`);
  }
  return { ok: true, forma, nota };
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

interface ContextoSecao {
  semantica: Semantica;
  plano: PlanoTema;
  papeis: Papeis;
  distintos: Readonly<Record<string, number>>;
  rotuloMetrica: (id: string) => string;
}

/** O QuerySpec e o visual de cada forma. Devolve o motivo quando a semântica não tem o que a forma precisa. */
function visualDaSecao(s: SecaoReceita, forma: Forma, nota: string | undefined, ctx: ContextoSecao): DefinicaoVisual | { motivo: string } {
  const { semantica, papeis, distintos } = ctx;
  const m = idMetricaTema(s.metrica);
  const extras = forma === 'auto' ? [] : s.metricas.map(idMetricaTema);
  const titulo = (dim: string) => tituloSecao(s, ctx.rotuloMetrica(s.metrica), dim);
  const comum = { id: `tema-${s.id}`, forma, ...(s.icone ? { icone: s.icone } : {}), ...(nota ? { nota } : {}) };
  const tempo = semantica.dimensions.tempo;
  const tempoCol = tempo && tempo.type === 'tempo' ? tempo.column : undefined;

  if (s.dimensao === 'nenhuma') {
    const meta = forma === 'medidor' ? semantica.metrics[m]?.label.match(/\(≤ (.*)\)/)?.[1] : undefined;
    return { ...comum, titulo: titulo(''), subtitulo: s.explicacao, tipo: 'coluna', spec: { ...base, intent: 'kpi', metrics: [m, ...extras], dimensions: [] }, ...(meta ? { extra: { meta } } : {}) };
  }

  if (s.dimensao === 'tempo') {
    if (!tempo || !tempoCol) return { motivo: 'a coluna de data não tem datas válidas' };
    if (forma === 'heatmap_semana_hora' || forma === 'heatmap_semana_mes') {
      const dim2 = forma === 'heatmap_semana_hora' ? idHora(tempoCol) : idMes(tempoCol);
      if (!semantica.dimensions[idSemana(tempoCol)] || !semantica.dimensions[dim2]) return { motivo: 'não consegui separar a data em dia da semana e hora/mês' };
      return {
        ...comum,
        titulo: titulo(''),
        subtitulo: `${s.explicacao} · pela coluna "${tempo.label}"${semantica.dataset.min_group_size ? ` · quadrado vazio = menos de ${semantica.dataset.min_group_size} registros (dado sensível)` : ''}${nota ? ` · ${nota}` : ''}`,
        tipo: 'coluna',
        largo: true,
        spec: { ...base, intent: 'comparacao', metrics: [m], dimensions: [idSemana(tempoCol), dim2] },
      };
    }
    return {
      ...comum,
      titulo: titulo(''),
      subtitulo: `${s.explicacao} · por mês, pela coluna "${tempo.label}"${forma === 'media_movel' ? ' · tracejado: média dos últimos 3 meses' : ''}${nota ? ` · ${nota}` : ''}`,
      tipo: forma === 'lado_a_lado' ? 'coluna' : 'linha',
      largo: true,
      spec: { ...base, intent: 'tendencia', metrics: [m, ...extras], dimensions: ['tempo'], time: { grain: 'mes' } },
    };
  }

  const col = coluna(papeis, s.dimensao)!;
  if (forma === 'histograma') {
    const fx = idFaixa(col);
    if (!semantica.dimensions[fx]) return { motivo: `a coluna de ${rotuloPapel(s.dimensao)} tem poucos valores diferentes para montar faixas` };
    return {
      ...comum,
      titulo: titulo(minusculo(semantica.dimensions[fx]!.label)),
      subtitulo: `${s.explicacao} · quantos registros em cada faixa de "${ctx.plano.config.find((c) => c.id === col)?.rotulo ?? col}"`,
      tipo: 'coluna',
      spec: { ...base, intent: 'distribuicao', metrics: ['registros'], dimensions: [fx] },
    };
  }
  const dim = dimensaoDaColuna(semantica, col);
  if (!dim) return { motivo: `a coluna de ${rotuloPapel(s.dimensao)} não pôde virar categoria` };
  const rotuloDim = semantica.dimensions[dim]?.label ?? dim;
  const n = distintos[col] ?? 0;
  const sub = (texto: string) => `${s.explicacao} · ${texto}${nota ? ` · ${nota}` : ''}`;
  const dim2 = s.dimensao2 && forma !== 'auto' ? dimensaoDaColuna(semantica, coluna(papeis, s.dimensao2)) : undefined;

  switch (forma) {
    case 'pareto':
    case 'treemap':
      return {
        ...comum,
        titulo: titulo(rotuloDim),
        subtitulo: sub(forma === 'pareto' ? `os ${s.limite} maiores de "${rotuloDim}"; classe A = os que somam 80% do total` : `participação de cada "${rotuloDim}" (até ${s.limite})`),
        tipo: 'barra',
        spec: { ...base, intent: 'ranking', metrics: [m], dimensions: [dim], limit: s.limite, sort: { by: m, dir: 'desc' } },
      };
    case 'funil_etapas': {
      const etapas = etapasDoStatus(ctx.plano.amostras[col] ?? [])!;
      return {
        ...comum,
        titulo: titulo(rotuloDim),
        subtitulo: sub(`quantos chegaram a cada etapa de "${rotuloDim}" (quem está numa etapa passou pelas anteriores)${etapas.fora.length ? `; fora do funil: ${etapas.fora.join(', ')}` : ''}`),
        tipo: 'coluna',
        extra: { etapas: etapas.ordem, fora: etapas.fora },
        spec: { ...base, intent: 'comparacao', metrics: [m], dimensions: [dim] },
      };
    }
    case 'caixa':
    case 'bullet':
    case 'tabela_alerta':
      return {
        ...comum,
        titulo: titulo(rotuloDim),
        subtitulo: sub(
          forma === 'caixa' ? `caixa = metade do meio (de p25 a p75), traço = mediana; por "${rotuloDim}"` : forma === 'bullet' ? `os ${s.limite} itens com maior falta; traço = estoque mínimo` : 'só os itens com estoque abaixo do mínimo',
        ),
        tipo: 'barra',
        spec: { ...base, intent: 'ranking', metrics: [m, ...extras], dimensions: [dim], limit: s.limite, sort: { by: m, dir: 'desc' } },
      };
    case 'lado_a_lado':
    case 'dispersao':
      return {
        ...comum,
        titulo: titulo(rotuloDim),
        subtitulo: sub(forma === 'dispersao' ? `um ponto por "${rotuloDim}"` : `por "${rotuloDim}"`),
        tipo: forma === 'dispersao' ? 'dispersao' : 'coluna',
        spec: { ...base, intent: 'comparacao', metrics: [m, ...extras], dimensions: [dim] },
      };
    case 'heatmap':
    case 'empilhado':
      if (!dim2) break;
      return {
        ...comum,
        titulo: titulo(rotuloDim),
        subtitulo: sub(`"${rotuloDim}" × "${semantica.dimensions[dim2]?.label ?? dim2}"`),
        tipo: 'barra',
        largo: true,
        spec: { ...base, intent: 'comparacao', metrics: [m], dimensions: [dim, dim2] },
      };
    default:
      break;
  }
  // Gráfico simples (auto): colunas com poucos valores, ranking com muitos.
  const poucos = n > 0 && n <= 8;
  return {
    ...comum,
    forma: 'auto',
    titulo: titulo(rotuloDim),
    subtitulo: sub(poucos ? `os ${n} valores de "${rotuloDim}"` : `top ${Math.min(s.limite, 10)} de "${rotuloDim}"${n ? ` (${n} valores)` : ''}`),
    tipo: poucos ? 'coluna' : 'barra',
    spec: poucos
      ? { ...base, intent: 'comparacao', metrics: [m], dimensions: [dim] }
      : { ...base, intent: 'ranking', metrics: [m], dimensions: [dim], limit: Math.min(s.limite, 10), sort: { by: m, dir: 'desc' } },
  };
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

  // Seções: o hero do objetivo, depois a ordem do objetivo, depois as outras da receita.
  const doObjetivo = objetivo.hero ? [objetivo.hero, ...objetivo.secoes.filter((id) => id !== objetivo.hero)] : objetivo.secoes;
  const ordem = [...doObjetivo, ...receita.secoes.map((s) => s.id).filter((id) => !objetivo.secoes.includes(id))];
  const ctx: ContextoSecao = { semantica, plano, papeis, distintos, rotuloMetrica };
  const disponiveis: { secao: SecaoReceita; visual: DefinicaoVisual }[] = [];
  for (const id of ordem) {
    const s = receita.secoes.find((x) => x.id === id)!;
    const titulo = tituloSecao(s, rotuloMetrica(s.metrica), s.dimensao === 'tempo' || s.dimensao === 'nenhuma' ? '' : rotuloPapel(s.dimensao));
    const av = avaliarSecao(s, plano, papeis);
    if (!av.ok) {
      if (!av.silencioso) esconder(s, titulo, av.motivo);
      continue;
    }
    if (!temMetrica(s.metrica)) continue;
    const visual = visualDaSecao(s, av.forma, av.nota, ctx);
    if ('motivo' in visual) {
      esconder(s, titulo, visual.motivo);
      continue;
    }
    disponiveis.push({ secao: s, visual });
  }
  const escondidos = [...motivos].map(([motivo, titulos]) => ({ motivo, titulos }));

  const doPublico = disponiveis.filter((d) => !(publico === 'cliente' && d.secao.interno));
  const visiveis = doPublico.slice(0, MAX_SECOES[publico]);
  const cortadosPeloPublico = disponiveis.length - visiveis.length;
  // O primeiro visual do objetivo é o gráfico principal (hero): topo, largo e mais alto.
  const visuais = visiveis.map((d, i) => (i === 0 && objetivo.secoes.includes(d.secao.id) ? { ...d.visual, hero: true, largo: true } : d.visual));
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
      layoutKpis: 'padrao',
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
    insights: (insights.length ? insights : visuais).filter((v) => !v.forma || v.forma === 'auto'),
    layoutKpis: receita.layout.kpis,
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
