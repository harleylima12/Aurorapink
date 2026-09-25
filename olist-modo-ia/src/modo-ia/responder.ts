/**
 * Pipeline do Modo Rápido (seção 4): pergunta -> Camada 0 -> validação (Zod) -> compilador SQL
 * -> DuckDB -> motor de insights -> seletor de gráfico -> narrador por template.
 *
 * Fase 4: se a Camada 0 não entendeu (`paraCamada1`) e a IA local está pronta, a pergunta vai para
 * o planejador (Camada 1), que devolve só um QuerySpec; o resto do caminho é o MESMO.
 *
 * Recebe o banco por uma interface (`Executor`), então roda igual no navegador (DuckDB-WASM
 * no worker) e nos testes (DuckDB-WASM no Node).
 */
import { selecionarGrafico, type SelecaoGrafico } from '../charts/selector';
import type { Linha, Parametro } from '../data/duckdb';
import { gerarFatos, type Fato } from '../insights/engine';
import { narrar, type TextoResposta } from '../narrator/templates';
import { compilar, type ColunaResultado } from '../query/compiler';
import { anoAnterior, specDeComparacao } from '../query/periodo';
import { criarSchemaQuerySpec, type QuerySpec } from '../query/spec';
import { periodoMes } from '../query/timeParser';
import { narrarComIA } from '../ai/narrator';
import { planejar } from '../ai/planner';
import type { MotorLLM } from '../ai/tipos';
import type { Roteador, Roteamento, Valores } from '../router/layer0';
import type { Semantica } from '../semantic/schema';

export interface Executor {
  consultar(sql: string, params?: readonly Parametro[]): Promise<{ linhas: Linha[]; ms: number; doCache?: boolean }>;
}

export interface ConsultaFeita {
  rotulo: string;
  sql: string;
  params: Parametro[];
  ms: number;
  linhas: number;
  doCache: boolean;
}

export interface Resposta {
  id: string;
  pergunta: string;
  /** Quem montou o spec: a Camada 0 (regras) ou a Camada 1 (IA local). */
  modo: 'rapido' | 'ia';
  tipo: 'dados' | 'esclarecer' | 'fora_de_escopo' | 'erro';
  spec: QuerySpec;
  confianca: number;
  rastro: string[];
  rotuloPeriodo?: string;
  consultas: ConsultaFeita[];
  colunas: ColunaResultado[];
  linhas: Linha[];
  fatos: Fato[];
  grafico?: SelecaoGrafico;
  texto: TextoResposta;
  sugestoes?: string[];
  /** Camada 1: prompt, saída crua do modelo e validação (aparece em "Como calculei"). */
  planejamento?: InfoPlanejamento;
  /** Quem escreveu o texto: o template (sempre primeiro) ou a IA (depois, se passar no validador). */
  narracao: InfoNarracao;
  /** Da pergunta até a resposta pronta (roteamento + SQL + insights + texto). */
  ms: number;
}

export interface InfoPlanejamento {
  modelo: string;
  versaoPrompt: string;
  bruto: string;
  valido: boolean;
  erros: string[];
  ajustes: string[];
  ms: number;
  /** Tamanho do prompt (caracteres), para acompanhar o custo em GPU fraca. */
  caracteresPrompt: number;
}

export interface InfoNarracao {
  origem: 'template' | 'ia';
  modelo?: string;
  versaoPrompt?: string;
  ms?: number;
  /** Por que o texto da IA foi rejeitado (o template ficou). */
  rejeitada?: string[];
  bruto?: string;
}

export interface ContextoResposta {
  executor: Executor;
  semantica: Semantica;
  roteador: Roteador;
  mesesParciais: ReadonlySet<string>;
  ancora: string;
  /** IA local pronta (Camada 1). Sem ela, tudo fica na Camada 0. */
  ia?: { motor: MotorLLM; valores: Valores };
}

let contador = 0;
const novoId = () => `r${Date.now().toString(36)}${(contador++).toString(36)}`;

function rotuloDeDatas(from?: string, to?: string): string | undefined {
  if (!from || !to) return undefined;
  const [a1, m1] = from.split('-').map(Number);
  const [a2, m2] = to.split('-').map(Number);
  if (from === to) return from.split('-').reverse().join('/');
  if (a1 && m1 && a1 === a2 && m1 === m2 && from.endsWith('-01')) return periodoMes(a1, m1).rotulo;
  if (from.endsWith('-01-01') && to.endsWith('-12-31') && a1 === a2) return String(a1);
  return `${from.split('-').reverse().join('/')} a ${to.split('-').reverse().join('/')}`;
}

export async function responder(pergunta: string, ctx: ContextoResposta, anterior: QuerySpec | null = null): Promise<Resposta> {
  const t0 = performance.now();
  const roteamento = ctx.roteador.rotear(pergunta, anterior);
  if (roteamento.paraCamada1 && ctx.ia) {
    try {
      const p = await planejar({ motor: ctx.ia.motor, semantica: ctx.semantica, valores: ctx.ia.valores, pergunta, anterior, ancora: ctx.ancora });
      const planejamento: InfoPlanejamento = {
        modelo: ctx.ia.motor.id,
        versaoPrompt: p.versaoPrompt,
        bruto: p.bruto,
        valido: p.valido,
        erros: p.erros,
        ajustes: p.ajustes,
        ms: p.ms,
        caracteresPrompt: p.mensagens.reduce((n, m) => n + m.content.length, 0),
      };
      const rastro = [
        `Camada 0 com baixa confiança (${Math.round(roteamento.confianca * 100)}%): pergunta enviada à IA local`,
        `Camada 1: ${ctx.ia.motor.id}, prompt ${p.versaoPrompt}, ${Math.round(p.ms)} ms`,
        ...(p.valido ? ['spec do modelo validado (Zod + valores da base)'] : p.erros.map((e) => `spec rejeitado: ${e}`)),
        ...p.ajustes.map((a) => `ajuste: ${a}`),
      ];
      const r = await executarRoteamento(pergunta, { spec: p.spec, confianca: p.valido ? 0.7 : 0, rastro, sugestoes: p.spec.clarify?.options }, ctx, t0);
      return { ...r, modo: 'ia', planejamento };
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      const r = await executarRoteamento(pergunta, roteamento, ctx, t0);
      return { ...r, rastro: [...r.rastro, `IA local falhou (${motivo}); resposta da Camada 0`] };
    }
  }
  return executarRoteamento(pergunta, roteamento, ctx, t0);
}

/**
 * Troca o texto do template pelo da IA, se ele passar no validador (placeholders, sem números soltos,
 * sem causa afirmada). Rejeitou ou deu erro? Fica o template, com o motivo registrado.
 */
export async function narrarComMotor(r: Resposta, motor: MotorLLM, aoParcial?: (t: string) => void): Promise<Resposta> {
  if (r.tipo !== 'dados' || !r.fatos.length) return r;
  try {
    const n = await narrarComIA(motor, r.pergunta, r.texto.titulo, r.fatos, aoParcial);
    if (n.ok && n.texto) return { ...r, texto: n.texto, narracao: { origem: 'ia', modelo: motor.id, versaoPrompt: n.versaoPrompt, ms: n.ms, bruto: n.bruto } };
    return { ...r, narracao: { origem: 'template', modelo: motor.id, versaoPrompt: n.versaoPrompt, ms: n.ms, rejeitada: n.erros, bruto: n.bruto } };
  } catch (erro) {
    return { ...r, narracao: { origem: 'template', modelo: motor.id, rejeitada: [erro instanceof Error ? erro.message : String(erro)] } };
  }
}

export async function responderSpec(titulo: string, spec: QuerySpec, ctx: ContextoResposta): Promise<Resposta> {
  const t0 = performance.now();
  return executarRoteamento(titulo, { spec, confianca: 1, rastro: ['spec pronto (insight automático ou fixado)'] }, ctx, t0);
}

async function executarRoteamento(pergunta: string, roteamento: Roteamento, ctx: ContextoResposta, t0: number): Promise<Resposta> {
  const { spec, confianca, rastro } = roteamento;
  const base: Resposta = {
    id: novoId(),
    pergunta,
    modo: 'rapido',
    tipo: 'dados',
    spec,
    confianca,
    rastro,
    rotuloPeriodo: roteamento.rotuloPeriodo,
    consultas: [],
    colunas: [],
    linhas: [],
    fatos: [],
    texto: { titulo: '', bullets: [] },
    narracao: { origem: 'template' },
    ms: 0,
  };
  const fim = (r: Resposta): Resposta => ({ ...r, ms: performance.now() - t0 });

  if (spec.intent === 'esclarecer') {
    return fim({ ...base, tipo: 'esclarecer', texto: { titulo: spec.clarify?.question ?? 'Pode detalhar?', bullets: [] }, sugestoes: roteamento.sugestoes ?? spec.clarify?.options });
  }
  if (spec.intent === 'fora_de_escopo') {
    return fim({
      ...base,
      tipo: 'fora_de_escopo',
      texto: { titulo: 'Não tenho esse dado', bullets: [spec.out_of_scope_reason ?? 'Essa informação não está na base.'] },
      sugestoes: ['Faturamento mês a mês', 'Top 5 categorias em 2018', 'Nota de quem recebeu atrasado vs no prazo'],
    });
  }

  // Validação: o mesmo schema que vai restringir a IA na Fase 4.
  const validado = criarSchemaQuerySpec(ctx.semantica).safeParse(spec);
  if (!validado.success) {
    return fim({
      ...base,
      tipo: 'erro',
      texto: { titulo: 'Não consegui montar essa consulta', bullets: validado.error.issues.map((i) => i.message) },
    });
  }

  const consultas: ConsultaFeita[] = [];
  const rodar = async (rotulo: string, s: QuerySpec) => {
    const { sql, params, colunas } = compilar(s, ctx.semantica);
    const r = await ctx.executor.consultar(sql, params);
    consultas.push({ rotulo, sql, params, ms: r.ms, linhas: r.linhas.length, doCache: r.doCache ?? false });
    return { linhas: r.linhas, colunas };
  };

  try {
    const [idMetrica] = spec.metrics;
    const metrica = idMetrica ? ctx.semantica.metrics[idMetrica] : undefined;
    let rotuloPeriodo = roteamento.rotuloPeriodo ?? rotuloDeDatas(spec.time?.from, spec.time?.to);

    if (spec.intent === 'explicar_variacao') {
      const anteriorSpec = specDeComparacao(spec);
      const atual: QuerySpec = { ...spec, intent: 'comparacao', time: { from: spec.time?.from, to: spec.time?.to } };
      const principal = await rodar('período atual, por segmento', atual);
      const anterior = anteriorSpec ? await rodar('período anterior, por segmento', { ...anteriorSpec, intent: 'comparacao' }) : null;
      const rotulos = { atual: rotuloDeDatas(spec.time?.from, spec.time?.to) ?? 'atual', anterior: rotuloDeDatas(anteriorSpec?.time?.from, anteriorSpec?.time?.to) ?? 'anterior' };
      rotuloPeriodo = `${rotulos.atual} vs ${rotulos.anterior}`;
      const fatos = gerarFatos({ spec, semantica: ctx.semantica, linhas: principal.linhas, anteriorPorSegmento: anterior?.linhas ?? [] });
      return fim({
        ...base,
        rotuloPeriodo,
        consultas,
        colunas: principal.colunas,
        linhas: principal.linhas,
        fatos,
        grafico: selecionarGrafico({ spec, semantica: ctx.semantica, linhas: principal.linhas, anteriorPorSegmento: anterior?.linhas ?? [], rotulosPeriodo: rotulos }),
        texto: narrar(spec, fatos, ctx.semantica, rotuloPeriodo),
      });
    }

    const principal = await rodar('resposta', spec);
    let total: number | null = null;
    let comparacao: Linha[] | null = null;
    const comDimensao = spec.dimensions.length > 0 && !spec.dimensions.includes('tempo');
    if (comDimensao && metrica?.empty_is_zero && idMetrica) {
      const r = await rodar('total (para a participação)', { intent: 'kpi', metrics: [idMetrica], dimensions: [], filters: spec.filters, ...(spec.time ? { time: { from: spec.time.from, to: spec.time.to } } : {}) });
      const v = r.linhas[0]?.[idMetrica];
      total = typeof v === 'number' ? v : null;
    }
    const specComparacao = specDeComparacao(spec);
    if (specComparacao && spec.dimensions.length === 0) {
      comparacao = (await rodar('período de comparação', specComparacao)).linhas;
      const atual = rotuloDeDatas(spec.time?.from, spec.time?.to);
      const antes = rotuloDeDatas(specComparacao.time?.from, specComparacao.time?.to) ?? (spec.time?.from ? anoAnterior(spec.time.from) : '');
      rotuloPeriodo = `${atual ?? ''} vs ${antes}`;
    }
    const fatos = gerarFatos({ spec, semantica: ctx.semantica, linhas: principal.linhas, total, comparacao, mesesParciais: ctx.mesesParciais });
    return fim({
      ...base,
      rotuloPeriodo,
      consultas,
      colunas: principal.colunas,
      linhas: principal.linhas,
      fatos,
      grafico: selecionarGrafico({ spec, semantica: ctx.semantica, linhas: principal.linhas, total, mesesParciais: ctx.mesesParciais }),
      texto: narrar(spec, fatos, ctx.semantica, rotuloPeriodo),
    });
  } catch (erro) {
    return fim({ ...base, tipo: 'erro', consultas, texto: { titulo: 'Erro ao calcular', bullets: [erro instanceof Error ? erro.message : String(erro)] } });
  }
}
