/**
 * Camada 1: o LLM como PLANEJADOR (nunca calculadora, P1; nunca SQL, P2).
 *
 * pergunta -> prompt enxuto -> modelo com JSON Schema (temperature 0) -> JSON -> validação Zod
 * -> valores conferidos contra a base -> QuerySpec. Qualquer falha vira pergunta de esclarecimento.
 */
import { criarSchemaQuerySpec, type QuerySpec } from '../query/spec';
import { resolverValor } from '../query/valueResolver';
import type { Semantica } from '../semantic/schema';
import { montarMensagensPlanejador, VERSAO_PROMPT_PLANEJADOR } from './prompts/planner';
import { schemaQuerySpecParaModelo } from './schemaModelo';
import type { MensagemChat, MotorLLM } from './tipos';

export interface EntradaPlanejador {
  motor: MotorLLM;
  semantica: Semantica;
  valores: Readonly<Record<string, readonly string[]>>;
  pergunta: string;
  anterior: QuerySpec | null;
  ancora: string;
}

export interface ResultadoPlanejador {
  spec: QuerySpec;
  valido: boolean;
  erros: string[];
  /** Texto cru devolvido pelo modelo (aparece em "Como calculei"). */
  bruto: string;
  ms: number;
  versaoPrompt: string;
  mensagens: MensagemChat[];
  ajustes: string[];
}

export const MAX_TOKENS_PLANEJADOR = 256;

function esclarecer(pergunta: string, opcoes: string[]): QuerySpec {
  return { intent: 'esclarecer', metrics: [], dimensions: [], filters: [], clarify: { question: pergunta, options: opcoes.slice(0, 3) } };
}

/** Tira cercas de código e texto antes/depois do JSON (modelos pequenos às vezes enfeitam). */
export function extrairJson(texto: string): unknown {
  const limpo = texto.replace(/```(json)?/g, '').trim();
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio < 0 || fim <= inicio) throw new Error('a resposta não tem JSON');
  return JSON.parse(limpo.slice(inicio, fim + 1)) as unknown;
}

/** Validação + conferência de valores (função pura; testada com saídas certas e erradas). */
export function validarSpecDoModelo(
  bruto: string,
  semantica: Semantica,
  valores: Readonly<Record<string, readonly string[]>>,
): { spec: QuerySpec; valido: boolean; erros: string[]; ajustes: string[] } {
  const ajustes: string[] = [];
  let json: unknown;
  try {
    json = extrairJson(bruto);
  } catch (e) {
    return { spec: esclarecer('Não entendi. Pode reformular?', ['Faturamento total', 'Faturamento mês a mês', 'Top 5 categorias em 2018']), valido: false, erros: [String(e instanceof Error ? e.message : e)], ajustes };
  }
  const r = criarSchemaQuerySpec(semantica).safeParse(json);
  if (!r.success) {
    return {
      spec: esclarecer('Não consegui montar essa consulta. Seria uma destas?', ['Faturamento total', 'Faturamento mês a mês', 'Top 5 categorias em 2018']),
      valido: false,
      erros: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      ajustes,
    };
  }
  const spec = r.data as QuerySpec;

  // Valores de filtro conferidos contra a base: "são paulo" -> "SP"; o que não existe vira pergunta.
  const filtros = [];
  for (const f of spec.filters) {
    const def = semantica.dimensions[f.dimension];
    if (!def || def.type === 'tempo') {
      filtros.push(f);
      continue;
    }
    const novos: string[] = [];
    for (const v of f.values) {
      const res = resolverValor(f.dimension, v, valores, semantica);
      if (!res.ok) {
        const opcoes = res.sugestoes.length ? res.sugestoes : [];
        return {
          spec: esclarecer(`Não encontrei "${String(v)}" em ${def.label.toLowerCase()}.${opcoes.length ? ' Quis dizer:' : ''}`, opcoes.length ? opcoes : ['Ver todos']),
          valido: false,
          erros: [`valor inexistente: ${f.dimension} = ${String(v)}`],
          ajustes,
        };
      }
      if (res.valor !== v) ajustes.push(`"${String(v)}" → "${res.valor}" (${res.como})`);
      novos.push(res.valor);
    }
    filtros.push({ ...f, values: novos });
  }
  const corrigido: QuerySpec = { ...spec, filters: filtros };
  if (corrigido.intent === 'ranking') {
    const [m] = corrigido.metrics;
    corrigido.limit ??= semantica.defaults.limit;
    if (m && !corrigido.sort) corrigido.sort = { by: m, dir: 'desc' };
  }
  if (corrigido.intent === 'explicar_variacao' && !corrigido.dimensions.filter((d) => d !== 'tempo').length) {
    corrigido.dimensions = ['categoria'];
    ajustes.push('explicar_variacao sem dimensão: categoria');
  }
  return { spec: corrigido, valido: true, erros: [], ajustes };
}

export async function planejar(e: EntradaPlanejador): Promise<ResultadoPlanejador> {
  const mensagens = montarMensagensPlanejador({ semantica: e.semantica, pergunta: e.pergunta, anterior: e.anterior, ancora: e.ancora, valores: e.valores });
  const resposta = await e.motor.completar({
    mensagens,
    schemaJson: JSON.stringify(schemaQuerySpecParaModelo(e.semantica)),
    maxTokens: MAX_TOKENS_PLANEJADOR,
  });
  const v = validarSpecDoModelo(resposta.texto, e.semantica, e.valores);
  return { ...v, bruto: resposta.texto, ms: resposta.ms, versaoPrompt: VERSAO_PROMPT_PLANEJADOR, mensagens };
}
