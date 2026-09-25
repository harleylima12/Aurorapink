/**
 * Camada 0, o "Modo Rápido": transforma a pergunta em QuerySpec SEM IA.
 *
 * Como funciona (tudo determinístico, testado em tests/unit/layer0.test.ts e na suíte evals/perguntas.json):
 * 1. normaliza (minúsculas, sem acento) e tira os trechos de tempo (parser de tempo);
 * 2. procura no texto as frases do dicionário (métricas, dimensões, valores reais da base,
 *    palavras de intenção), sempre a MAIS LONGA primeiro ("rio grande do sul" antes de "rio",
 *    "no prazo" antes de "prazo"); erros de digitação passam pelo fuse.js;
 * 3. regras de intenção montam o spec; uma nota de confiança diz se dá para responder
 *    ou se é melhor perguntar de volta (chips) — ou avisar que o dado não existe.
 */
import Fuse from 'fuse.js';

import { interpretarTempo, periodoMes } from '../query/timeParser';
import type { Filtro, Grao, Intencao, QuerySpec } from '../query/spec';
import type { Semantica } from '../semantic/schema';
import { normalizar, numero, PALAVRAS_NUMERO, PARADA as PARADA_BRUTA, radical, tokens } from './normalizar';

const PARADA = new Set([...PARADA_BRUTA].map(radical));

export type Valores = Readonly<Record<string, readonly string[]>>;

export interface Roteamento {
  spec: QuerySpec;
  /** 0 a 1. Abaixo do limiar, o app pergunta de volta em vez de chutar. */
  confianca: number;
  rotuloPeriodo?: string;
  /** O que foi reconhecido e por quê (aparece em "Como calculei"). */
  rastro: string[];
  /** Para intent "esclarecer": o texto que cada chip envia. */
  sugestoes?: string[];
  /**
   * A Camada 0 não entendeu direito (confiança baixa, palavras desconhecidas, follow-up que não mudou nada).
   * Com a IA local pronta, a pergunta vai para a Camada 1 (planejador); sem ela, vale a resposta daqui.
   */
  paraCamada1?: boolean;
}

export const LIMIAR_CONFIANCA = 0.45;

type Tipo = 'metrica' | 'dimensao' | 'valor' | 'palavra';

interface Entrada {
  chave: string[];
  tipo: Tipo;
  id: string;
  /** Valores canônicos (mais de um = ambíguo, ex.: "móveis"). */
  valores?: string[];
  /** Menor = ganha no empate de tamanho. */
  prioridade: number;
  /** Só vale com o texto original em maiúsculas ou depois de "em/no/de" (UFs como "PE", "TO", "SE"). */
  exigeContexto?: boolean;
}

interface Achado {
  entrada: Entrada;
  inicio: number;
  fim: number;
  fuzzy: boolean;
  texto: string;
}

const PALAVRAS: Record<string, string[]> = {
  ranking: ['top', 'maior', 'maiores', 'mais', 'ranking', 'lider', 'lideres', 'lidera', 'campeao', 'campeoes', 'principais', 'primeiros', 'primeiras', 'melhor', 'melhores', 'pior', 'piores', 'menor', 'menores', 'menos', 'mais caro', 'mais barato', 'lideram', 'destaque'],
  asc: ['menor', 'menores', 'menos', 'mais barato', 'barato', 'baratos'],
  desc: ['maior', 'maiores', 'mais', 'top', 'mais caro', 'caro', 'caros'],
  melhor: ['melhor', 'melhores'],
  pior: ['pior', 'piores'],
  comparacao: ['vs', 'versus', 'x', 'comparar', 'compare', 'compara', 'comparacao', 'comparando', 'diferenca', 'contra', 'comparativo', 'entre'],
  explicar: ['por que', 'porque', 'por qual motivo', 'o que explica', 'explica', 'explique', 'motivo', 'causa', 'o que aconteceu', 'caiu', 'cairam', 'queda', 'subiu', 'aumentou', 'diminuiu', 'despencou', 'piorou', 'melhorou'],
  distribuicao: ['distribuicao', 'histograma', 'faixas'],
  kpi: ['quanto', 'quantos', 'quantas', 'qual o total', 'total'],
  // Verbos de venda sem métrica explícita = faturamento ("quanto faturamos?").
  vendas: ['vendemos', 'vendeu', 'venderam', 'faturamos', 'faturou', 'faturaram', 'vendi', 'faturei', 'entrou', 'entraram'],
  medio: ['medio', 'media', 'em media', 'por pedido'],
  onde: ['onde', 'em que lugar', 'em que regiao', 'regiao', 'regioes'],
  vendedor: ['vendedor', 'vendedores', 'lojista', 'lojistas', 'seller'],
  cidade: ['cidade', 'cidades', 'municipio', 'municipios', 'capital'],
  vago: ['como estamos', 'como vamos', 'como esta', 'como anda', 'como andam', 'resumo', 'me conta', 'novidades', 'e ai', 'tudo bem', 'oi', 'ola', 'ajuda', 'o que voce sabe', 'o que da pra ver', 'me surpreenda', 'algo interessante', 'insights', 'relatorio'],
};

/** Coisas que a base não tem (além de out_of_scope_hints do semantic.json). */
const FORA_EXTRA: Record<string, string> = {
  lucratividade: 'lucro',
  lucros: 'lucro',
  rentabilidade: 'lucro',
  margens: 'margem',
  custos: 'custo',
  inventario: 'estoque',
  devolucoes: 'devolução',
  reembolso: 'devolução',
  campanha: 'marketing',
  campanhas: 'marketing',
  anuncio: 'marketing',
  metas: 'meta',
  previsao: 'previsão',
  prever: 'previsão',
  proximo: 'previsão',
  funcionario: 'funcionário',
  funcionarios: 'funcionário',
  salario: 'funcionário',
  concorrente: 'concorrente',
  concorrentes: 'concorrente',
  clima: 'externo',
  dolar: 'externo',
  pix: 'pix',
  idade: 'idade',
  genero: 'idade',
  sexo: 'idade',
};

const MOTIVOS_EXTRA: Record<string, string> = {
  previsão: 'Eu não faço previsões: só mostro o que aconteceu. Posso mostrar a tendência mês a mês.',
  funcionário: 'A base não tem dados de funcionários. Posso mostrar pedidos por estado do vendedor.',
  concorrente: 'A base só tem vendas da Olist. Posso mostrar o ranking de categorias.',
  externo: 'A base não tem dados externos (clima, câmbio). Posso mostrar faturamento ao longo do tempo.',
  pix: 'A base (2016–2018) não tem Pix. Posso mostrar os pedidos por forma de pagamento.',
  idade: 'A base não tem idade nem gênero dos clientes. Posso mostrar clientes por estado.',
};

/** UFs que também são palavras comuns: só valem em maiúsculas ou depois de "em/no/de". */
const UF_AMBIGUA = new Set(['to', 'pe', 'ma', 'es', 'al', 'pa', 'se', 'ce', 'am', 'ap', 'ac', 'go', 'ro', 'ba', 'pi']);
const PREPOSICOES_LUGAR = new Set(['em', 'no', 'na', 'de', 'do', 'da', 'pro', 'para', 'so', 'estado', 'uf', 'e', 'vs', 'x', 'versus', 'contra']);

const OPCOES_VAGAS = ['Faturamento do período', 'Evolução mensal do faturamento', 'Satisfação dos clientes'];
const PERGUNTAS_VAGAS = ['Qual o faturamento total?', 'Faturamento mês a mês', 'Qual a nota média dos clientes?'];

const LIMITE_CATEGORICO = 8;

function chaveDe(frase: string): string[] {
  return tokens(normalizar(frase)).map(radical);
}

function cabe(tokensTexto: string[], chave: string[], inicio: number): boolean {
  if (inicio + chave.length > tokensTexto.length) return false;
  return chave.every((t, i) => tokensTexto[inicio + i] === t);
}

export interface Roteador {
  rotear(pergunta: string, anterior?: QuerySpec | null): Roteamento;
}

export function criarRoteador(semantica: Semantica, valores: Valores, ancora: string): Roteador {
  const entradas: Entrada[] = [];
  const adicionar = (frase: string, tipo: Tipo, id: string, prioridade: number, extra: Partial<Entrada> = {}) => {
    const chave = chaveDe(frase);
    if (chave.length) entradas.push({ chave, tipo, id, prioridade, ...extra });
  };

  // Métricas e dimensões (semantic.json é a fonte única de verdade).
  for (const [id, m] of Object.entries(semantica.metrics)) {
    for (const frase of [id.replaceAll('_', ' '), m.label, ...m.synonyms]) adicionar(frase, 'metrica', id, 2);
  }
  for (const [id, d] of Object.entries(semantica.dimensions)) {
    if (d.type === 'tempo') continue;
    for (const frase of [id.replaceAll('_', ' '), d.label, ...d.synonyms]) adicionar(frase, 'dimensao', id, 3);
  }

  // Valores reais da base (+ apelidos). Palavras soltas de nomes de categoria viram atalhos ("beleza").
  const indicePalavras = new Map<string, Map<string, Set<string>>>(); // dim -> palavra -> valores
  for (const [id, d] of Object.entries(semantica.dimensions)) {
    if (d.type !== 'categoria') continue;
    const reais = valores[id] ?? [];
    const apelidos = d.value_aliases ?? {};
    for (const valor of new Set([...reais, ...Object.keys(apelidos)])) {
      const semUf = valor.replace(/ \([A-Z]{2}\)$/, '');
      const ehUf = /^[A-Z]{2}$/.test(valor);
      adicionar(semUf, 'valor', id, 1, { valores: [valor], exigeContexto: ehUf && UF_AMBIGUA.has(valor.toLowerCase()) });
      for (const apelido of apelidos[valor] ?? []) adicionar(apelido, 'valor', id, 1, { valores: [valor] });
      if (id === 'categoria') {
        const mapa = indicePalavras.get(id) ?? new Map<string, Set<string>>();
        for (const palavra of chaveDe(semUf)) {
          if (PARADA.has(palavra) || palavra.length < 4) continue;
          mapa.set(palavra, (mapa.get(palavra) ?? new Set()).add(valor));
        }
        indicePalavras.set(id, mapa);
      }
    }
  }
  for (const [dim, mapa] of indicePalavras) {
    for (const [palavra, conjunto] of mapa) {
      entradas.push({ chave: [palavra], tipo: 'valor', id: dim, valores: [...conjunto].sort(), prioridade: 4 });
    }
  }

  // Palavras de intenção e fora de escopo.
  // A mesma frase pode ter vários papéis ("mais caro" = ranking + ordem decrescente): ids juntos, separados por vírgula.
  const papeis = new Map<string, Set<string>>();
  for (const [id, frases] of Object.entries(PALAVRAS)) for (const f of frases) papeis.set(f, (papeis.get(f) ?? new Set()).add(id));
  for (const [frase, ids] of papeis) adicionar(frase, 'palavra', [...ids].join(','), 5);
  const hints = semantica.out_of_scope_hints;
  for (const chave of Object.keys(hints)) adicionar(chave, 'palavra', `fora:${chave}`, 0);
  for (const [palavra, chave] of Object.entries(FORA_EXTRA)) adicionar(palavra, 'palavra', `fora:${chave}`, 0);

  // Correção de digitação: só palavras soltas de métricas, dimensões e categorias.
  const fuzzyAlvos = entradas.filter((e) => e.chave.length === 1 && (e.chave[0]?.length ?? 0) >= 5 && e.tipo !== 'palavra');
  const fuse = new Fuse(fuzzyAlvos, { keys: [{ name: 'chave', getFn: (e) => e.chave[0] ?? '' }], threshold: 0.3, includeScore: true, ignoreLocation: true });

  const dimensoesCategoricas = (id: string) => (valores[id]?.length ?? 99) <= LIMITE_CATEGORICO || semantica.dimensions[id]?.type === 'faixa';

  function encontrar(tokensTexto: string[], originais: string[]): Achado[] {
    const candidatos: Achado[] = [];
    for (let i = 0; i < tokensTexto.length; i++) {
      for (const e of entradas) {
        if (e.chave[0] !== tokensTexto[i] || !cabe(tokensTexto, e.chave, i)) continue;
        if (e.exigeContexto) {
          const original = originais[i] ?? '';
          const antes = tokensTexto[i - 1] ?? '';
          if (!(original === original.toUpperCase() && /[A-Z]/.test(original)) && !PREPOSICOES_LUGAR.has(antes)) continue;
        }
        candidatos.push({ entrada: e, inicio: i, fim: i + e.chave.length, fuzzy: false, texto: tokensTexto.slice(i, i + e.chave.length).join(' ') });
      }
    }
    candidatos.sort((a, b) => b.fim - b.inicio - (a.fim - a.inicio) || a.entrada.prioridade - b.entrada.prioridade);
    const ocupado = new Array<boolean>(tokensTexto.length).fill(false);
    const escolhidos: Achado[] = [];
    for (const c of candidatos) {
      let livre = true;
      for (let i = c.inicio; i < c.fim; i++) if (ocupado[i]) livre = false;
      if (!livre) continue;
      for (let i = c.inicio; i < c.fim; i++) ocupado[i] = true;
      escolhidos.push(c);
    }
    // Digitação errada ("faturamnto"): só nas palavras que sobraram.
    tokensTexto.forEach((t, i) => {
      if (ocupado[i] || t.length < 5 || PARADA.has(t)) return;
      const [melhor] = fuse.search(t);
      if (melhor && (melhor.score ?? 1) <= 0.3) {
        ocupado[i] = true;
        escolhidos.push({ entrada: melhor.item, inicio: i, fim: i + 1, fuzzy: true, texto: t });
      }
    });
    return escolhidos.sort((a, b) => a.inicio - b.inicio);
  }

  function rotear(pergunta: string, anterior: QuerySpec | null = null): Roteamento {
    const rastro: string[] = [];
    const norm = normalizar(pergunta);
    const tempo = interpretarTempo(norm, ancora);
    if (tempo.trechos.length) rastro.push(`tempo: ${tempo.trechos.join(', ')}`);

    // Limite ("top 5", "os três maiores").
    let limite: number | undefined;
    const restoSemLimite = tempo.restante.replace(
      new RegExp(`\\b(top|os|as|primeiros|primeiras|maiores|menores|melhores|piores|principais)\\s+(\\d{1,2}|${PALAVRAS_NUMERO})\\b`),
      (trecho, _p, n: string) => {
        limite = numero(n) ?? undefined;
        return trecho.replace(n, ' ');
      },
    ).replace(new RegExp(`\\b(\\d{1,2}|${PALAVRAS_NUMERO})\\s+(maiores|menores|melhores|piores|principais|primeiros|primeiras|mais)\\b`), (trecho, n: string) => {
      limite ??= numero(n) ?? undefined;
      return trecho.replace(n, ' ');
    });
    if (limite !== undefined) limite = Math.min(Math.max(limite, 1), 50);

    const tokensTexto = tokens(restoSemLimite).map(radical);
    const originais = pergunta.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[?!.,;:()"'’]/g, ' ').split(/\s+/).filter(Boolean);
    const achados = encontrar(tokensTexto, originais);

    const palavras = new Set(achados.filter((a) => a.entrada.tipo === 'palavra').flatMap((a) => a.entrada.id.split(',')));
    const metricas: string[] = [];
    const dimensoes: string[] = [];
    const valoresPorDim = new Map<string, string[]>();
    const ambiguos: string[][] = [];
    let fuzzy = false;
    for (const a of achados) {
      fuzzy ||= a.fuzzy;
      const { tipo, id, valores: vals } = a.entrada;
      if (tipo === 'metrica' && !metricas.includes(id)) metricas.push(id);
      if (tipo === 'dimensao' && !dimensoes.includes(id)) dimensoes.push(id);
      if (tipo === 'valor' && vals) {
        if (vals.length > 1) ambiguos.push(vals);
        else {
          const lista = valoresPorDim.get(id) ?? [];
          if (!lista.includes(vals[0] ?? '')) lista.push(vals[0] ?? '');
          valoresPorDim.set(id, lista);
        }
      }
      rastro.push(`${tipo}: ${a.entrada.id}${vals ? ` = ${vals.join(' | ')}` : ''} ("${a.texto}"${a.fuzzy ? ', digitação corrigida' : ''})`);
    }
    const cobertos = new Set(achados.flatMap((a) => Array.from({ length: a.fim - a.inicio }, (_, k) => a.inicio + k)));
    const desconhecidas = tokensTexto.filter((t, i) => !cobertos.has(i) && !PARADA.has(t) && !/^\d+$/.test(t) && t.length > 2);
    if (desconhecidas.length) rastro.push(`não reconhecido: ${desconhecidas.join(', ')}`);

    // Com uma métrica exata, métricas achadas por correção de digitação ou por substantivo solto depois
    // de "de/do/dos" ("nota DOS clientes", "preço médio DOS itens") são só contexto, não outra métrica.
    const exatas = achados.filter((a) => a.entrada.tipo === 'metrica' && !a.fuzzy);
    for (const a of achados) {
      if (a.entrada.tipo !== 'metrica' || metricas.length < 2) continue;
      const depoisDePreposicao = ['de', 'do', 'dos', 'da', 'das'].includes(tokensTexto[a.inicio - 1] ?? '') && a.fim - a.inicio === 1;
      const soContexto = (a.fuzzy && exatas.length > 0) || (depoisDePreposicao && exatas.some((e) => e !== a && e.inicio < a.inicio));
      if (soContexto && metricas.includes(a.entrada.id)) metricas.splice(metricas.indexOf(a.entrada.id), 1);
    }
    if (!metricas.length && palavras.has('vendas')) {
      metricas.push('faturamento');
      rastro.push('verbo de venda: faturamento');
    }

    // UF citada com "vendedor" = estado do vendedor.
    if (palavras.has('vendedor') && valoresPorDim.has('estado_cliente')) {
      valoresPorDim.set('estado_vendedor', valoresPorDim.get('estado_cliente') ?? []);
      valoresPorDim.delete('estado_cliente');
      if (!dimensoes.includes('estado_vendedor') && dimensoes.includes('estado_cliente')) dimensoes.splice(dimensoes.indexOf('estado_cliente'), 1, 'estado_vendedor');
    } else if (palavras.has('vendedor') && dimensoes.includes('estado_cliente')) {
      dimensoes.splice(dimensoes.indexOf('estado_cliente'), 1, 'estado_vendedor');
    }
    // "no estado de SP": a palavra da dimensão só dá contexto ao valor (filtro, não ranking).
    for (const [dim, vals] of valoresPorDim) if (vals.length === 1 && dimensoes.includes(dim)) dimensoes.splice(dimensoes.indexOf(dim), 1);
    if (palavras.has('onde') && !dimensoes.length) dimensoes.push(palavras.has('vendedor') ? 'estado_vendedor' : 'estado_cliente');
    if (palavras.has('cidade') && !dimensoes.includes('cidade_cliente')) dimensoes.unshift('cidade_cliente');

    // Frete + "médio/caro/barato" = frete médio por pedido.
    const iFrete = metricas.indexOf('frete_total');
    if (iFrete >= 0 && (palavras.has('medio') || palavras.has('asc') || palavras.has('desc') || palavras.has('melhor') || palavras.has('pior')) && !metricas.includes('frete_medio')) {
      metricas.splice(iFrete, 1, 'frete_medio');
    }

    // --- Fora de escopo ------------------------------------------------------------
    const fora = [...palavras].find((p) => p.startsWith('fora:'));
    if (fora) {
      const chave = fora.slice(5);
      const motivo = semantica.out_of_scope_hints[chave] ?? MOTIVOS_EXTRA[chave] ?? 'Não tenho esse dado na base.';
      return { spec: { intent: 'fora_de_escopo', metrics: [], dimensions: [], filters: [], out_of_scope_reason: motivo }, confianca: 0.95, rastro };
    }

    // --- Follow-up ("e só em SP?", "e em 2018?", "e por estado?") ---------------------
    const ehContinuacao = /^(e|e so|e se|agora|so|e no|e na|e em|e para|e pro|e pra|mas)\b/.test(norm) && metricas.length === 0;
    if (anterior && ehContinuacao && !palavras.has('vago')) {
      const novo: QuerySpec = structuredClone(anterior);
      if (tempo.periodo) novo.time = { ...novo.time, from: tempo.periodo.from, to: tempo.periodo.to };
      if (tempo.serie) {
        novo.dimensions = ['tempo', ...novo.dimensions.filter((d) => d !== 'tempo')].slice(0, 2);
        novo.time = { ...novo.time, grain: tempo.grain ?? novo.time?.grain ?? 'mes' };
        novo.intent = 'tendencia';
      }
      for (const [dim, vals] of valoresPorDim) {
        novo.filters = [...novo.filters.filter((f) => f.dimension !== dim), { dimension: dim, op: 'in', values: vals }];
      }
      if (dimensoes.length) {
        novo.dimensions = [...(novo.dimensions.includes('tempo') && tempo.serie ? ['tempo'] : []), ...dimensoes].slice(0, 2);
        novo.intent = novo.dimensions.includes('tempo') ? 'tendencia' : dimensoes.some((d) => !dimensoesCategoricas(d)) ? 'ranking' : 'comparacao';
        if (novo.intent === 'ranking') novo.limit ??= limite ?? semantica.defaults.limit;
      }
      if (limite !== undefined) novo.limit = limite;
      rastro.push('continuação da pergunta anterior');
      const mudou = JSON.stringify(novo) !== JSON.stringify(anterior);
      return { spec: novo, confianca: mudou ? 0.8 : 0.3, rotuloPeriodo: tempo.periodo?.rotulo, rastro, ...(mudou && !fuzzy && !desconhecidas.length ? {} : { paraCamada1: true }) };
    }

    // --- Pergunta vaga ------------------------------------------------------------
    const nadaUtil = !metricas.length && !dimensoes.length && !valoresPorDim.size && !tempo.periodo && !tempo.serie;
    if (palavras.has('vago') && !metricas.length && !dimensoes.length) {
      return esclarecer('Posso mostrar um destes:', OPCOES_VAGAS, PERGUNTAS_VAGAS, 0.9, rastro);
    }
    if (nadaUtil && desconhecidas.length) {
      return {
        spec: {
          intent: 'fora_de_escopo',
          metrics: [],
          dimensions: [],
          filters: [],
          out_of_scope_reason: `Não encontrei "${desconhecidas.join(' ')}" nos dados. Tenho vendas, pedidos, clientes, entregas, frete, pagamentos e avaliações.`,
        },
        confianca: 0.7,
        rastro,
        paraCamada1: true,
      };
    }
    if (nadaUtil) return { ...esclarecer('O que você quer ver?', OPCOES_VAGAS, PERGUNTAS_VAGAS, 0.9, rastro), paraCamada1: true };

    // Categoria ambígua ("móveis"): pergunta qual.
    if (ambiguos.length && ![...valoresPorDim.keys()].includes('categoria')) {
      const opcoes = (ambiguos[0] ?? []).slice(0, 3);
      const qual = esclarecer('Qual destas categorias?', opcoes, opcoes.map((o) => `${pergunta} — ${o}`), 0.6, rastro);
      return fuzzy || desconhecidas.length ? { ...qual, paraCamada1: true } : qual;
    }

    // --- Monta o spec -------------------------------------------------------------
    let confianca = 0;
    const metricaPadrao = !metricas.length;
    if (metricaPadrao) metricas.push('faturamento');
    confianca += metricaPadrao ? 0.2 : fuzzy ? 0.35 : 0.5;
    if (metricaPadrao) rastro.push('métrica padrão: faturamento');

    const filtros: Filtro[] = [];
    let intent: Intencao = 'kpi';
    let grain: Grao | undefined;
    let time: QuerySpec['time'];
    let rotuloPeriodo = tempo.periodo?.rotulo;
    let sort: QuerySpec['sort'];

    // Valores: 1 valor = filtro; 2+ valores da mesma dimensão = comparação entre eles.
    for (const [dim, vals] of valoresPorDim) {
      filtros.push({ dimension: dim, op: 'in', values: vals });
      if (vals.length >= 2 && !dimensoes.includes(dim)) dimensoes.push(dim);
    }
    const comparaValores = [...valoresPorDim.values()].some((v) => v.length >= 2);
    if (dimensoes.length || valoresPorDim.size) confianca += 0.2;
    if (tempo.periodo || tempo.serie) confianca += 0.15;

    if (palavras.has('explicar') && !tempo.serie) {
      intent = 'explicar_variacao';
      const periodo = tempo.periodo ?? periodoMes(Number(ancora.slice(0, 4)), Number(ancora.slice(5, 7)));
      rotuloPeriodo = periodo.rotulo;
      time = { from: periodo.from, to: periodo.to, compare: tempo.compare ?? 'periodo_anterior' };
      if (!dimensoes.length) dimensoes.push('categoria');
      confianca += 0.2;
    } else if (tempo.serie) {
      intent = 'tendencia';
      grain = tempo.grain ?? 'mes';
      dimensoes.unshift('tempo');
      confianca += 0.15;
    } else if (tempo.anos && !dimensoes.length) {
      intent = 'comparacao';
      grain = 'ano';
      dimensoes.unshift('tempo');
      confianca += 0.15;
    } else if (palavras.has('comparacao') || comparaValores) {
      intent = dimensoes.length ? 'comparacao' : 'kpi';
      confianca += 0.15;
    } else if (palavras.has('distribuicao') || dimensoes.includes('faixa_de_preco')) {
      intent = 'distribuicao';
      if (!dimensoes.includes('faixa_de_preco')) dimensoes.unshift('faixa_de_preco');
      confianca += 0.15;
    } else if (dimensoes.length) {
      const temRanking = palavras.has('ranking') || palavras.has('onde') || limite !== undefined;
      intent = temRanking || dimensoes.some((d) => !dimensoesCategoricas(d)) ? 'ranking' : 'comparacao';
      if (temRanking) confianca += 0.15;
    } else {
      intent = 'kpi';
      if (palavras.has('kpi')) confianca += 0.15;
    }

    // Filtros: o valor que já virou dimensão comparada continua como filtro (compara só os citados).
    if (intent === 'ranking') {
      const [m] = metricas;
      const polaridade = m ? semantica.metrics[m]?.polarity : undefined;
      let dir: 'asc' | 'desc' = 'desc';
      if (palavras.has('asc')) dir = 'asc';
      if (palavras.has('melhor')) dir = polaridade === 'lower_is_better' ? 'asc' : 'desc';
      if (palavras.has('pior')) dir = polaridade === 'lower_is_better' ? 'desc' : 'asc';
      if (m) sort = { by: m, dir };
      limite ??= semantica.defaults.limit;
    }

    if (intent !== 'explicar_variacao') {
      if (tempo.periodo) time = { from: tempo.periodo.from, to: tempo.periodo.to };
      if (grain) time = { ...time, grain };
      if (tempo.compare) {
        const fimPadrao = ancora;
        time = { ...time, from: time?.from ?? `${ancora.slice(0, 4)}-01-01`, to: time?.to ?? fimPadrao, compare: tempo.compare };
      }
    }
    if (time?.to === '2099-12-31') time = { ...time, to: '2018-12-31' };

    confianca -= 0.12 * desconhecidas.length;
    confianca = Math.max(0, Math.min(1, confianca));

    const spec: QuerySpec = {
      intent,
      metrics: metricas.slice(0, 3),
      dimensions: dimensoes.slice(0, 2),
      filters: filtros,
      ...(time ? { time } : {}),
      ...(sort ? { sort } : {}),
      ...(intent === 'ranking' || (limite !== undefined && dimensoes.length) ? { limit: limite ?? semantica.defaults.limit } : {}),
    };

    if (confianca < LIMIAR_CONFIANCA) {
      const [m] = metricas;
      const rotulo = semantica.metrics[m ?? 'faturamento']?.label ?? 'Faturamento';
      const duvida = esclarecer(
        'Não tenho certeza do que você quer ver. Seria um destes?',
        [`${rotulo} total`, `${rotulo} mês a mês`, `${rotulo} por estado`],
        [`${rotulo} total`, `${rotulo} mês a mês`, `${rotulo} por estado`],
        confianca,
        rastro,
      );
      return { ...duvida, paraCamada1: true };
    }
    // Palpite por digitação corrigida ou palavra desconhecida: a IA (se pronta) revê a pergunta.
    const palpite = fuzzy || desconhecidas.length > 0;
    return { spec, confianca, rotuloPeriodo, rastro, ...(palpite ? { paraCamada1: true } : {}) };
  }

  return { rotear };
}

function esclarecer(pergunta: string, opcoes: string[], envios: string[], confianca: number, rastro: string[]): Roteamento {
  return {
    spec: { intent: 'esclarecer', metrics: [], dimensions: [], filters: [], clarify: { question: pergunta, options: opcoes.slice(0, 3) } },
    confianca,
    rastro,
    sugestoes: envios.slice(0, 3),
  };
}
