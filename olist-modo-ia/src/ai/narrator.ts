/**
 * Narrador da IA com placeholders + validador (seção 13; ajuste 10 da Fase 0).
 *
 * O modelo escreve "{{primeiro.rotulo}} lidera com {{primeiro}}"; o APP troca {{primeiro}} pelo
 * valor_formatado do fato (que veio do DuckDB). A resposta é REJEITADA se tiver:
 * - dígito fora de placeholder; número por extenso ("dois", "metade", "dobro", "milhão");
 * - nome de mês (datas entram por placeholder);
 * - placeholder de um fato que não existe;
 * - afirmação de causa fora do campo "hipotese" (que precisa começar com "Hipótese:").
 * Rejeitou? O template (já na tela) fica, e a falha é registrada para a avaliação.
 */
import type { Fato } from '../insights/engine';
import type { TextoResposta } from '../narrator/templates';
import { numerosNaoRastreaveis } from '../narrator/validador';
import { normalizar } from '../router/normalizar';
import { extrairJson } from './planner';
import { montarMensagensNarrador, VERSAO_PROMPT_NARRADOR } from './prompts/narrator';
import { schemaNarracao, schemaNarracaoParaModelo } from './schemaModelo';
import type { MotorLLM } from './tipos';

const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*)(\.rotulo)?\s*\}\}/g;

const NUMEROS_POR_EXTENSO = [
  'dois', 'duas', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'vinte', 'trinta',
  'cem', 'cento', 'mil', 'milhao', 'milhoes', 'bilhao', 'bilhoes', 'metade', 'dobro', 'triplo', 'dezena', 'dezenas',
  'centena', 'centenas', 'porcento', 'por cento', 'terco', 'quarto', 'dobrou', 'triplicou',
];
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const CAUSAIS = ['porque', 'devido', 'por causa', 'causou', 'causado', 'causada', 'gracas a', 'em razao', 'em virtude', 'resultado de', 'motivado', 'culpa'];

export interface NarracaoIA {
  titulo: string;
  bullets: { texto: string; fatos: string[] }[];
  hipotese?: string;
}

export interface ValidacaoNarracao {
  ok: boolean;
  erros: string[];
  texto?: TextoResposta;
}

function temPalavra(textoNormalizado: string, palavra: string): boolean {
  return new RegExp(`(^|[^a-z])${palavra}([^a-z]|$)`).test(textoNormalizado);
}

function checarTrecho(onde: string, texto: string, fatos: ReadonlyMap<string, Fato>, permiteCausa: boolean): string[] {
  const erros: string[] = [];
  for (const m of texto.matchAll(PLACEHOLDER)) if (!fatos.has(m[1] ?? '')) erros.push(`${onde}: placeholder inexistente {{${m[1] ?? ''}${m[2] ?? ''}}}`);
  const semPlaceholders = texto.replace(PLACEHOLDER, ' ');
  if (/\d/.test(semPlaceholders)) erros.push(`${onde}: dígito fora de placeholder`);
  if (/[{}]/.test(semPlaceholders)) erros.push(`${onde}: placeholder malformado`);
  const n = normalizar(semPlaceholders);
  for (const p of NUMEROS_POR_EXTENSO) if (temPalavra(n, p)) erros.push(`${onde}: número por extenso "${p}"`);
  for (const p of MESES) if (temPalavra(n, p)) erros.push(`${onde}: mês escrito ("${p}"), deveria ser placeholder`);
  if (!permiteCausa) for (const p of CAUSAIS) if (temPalavra(n, p)) erros.push(`${onde}: afirmação de causa ("${p}") fora da hipótese`);
  return erros;
}

function preencher(texto: string, fatos: ReadonlyMap<string, Fato>): string {
  return texto.replace(PLACEHOLDER, (_t, id: string, rotulo?: string) => {
    const f = fatos.get(id);
    return f ? (rotulo ? f.rotulo : f.valor_formatado) : '';
  });
}

/** Valida a narração do modelo e, se estiver limpa, devolve o texto com os valores preenchidos. */
export function validarNarracao(bruto: string, fatos: readonly Fato[]): ValidacaoNarracao {
  let json: unknown;
  try {
    json = extrairJson(bruto);
  } catch (e) {
    return { ok: false, erros: [`JSON inválido: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const r = schemaNarracao(fatos.map((f) => f.id)).safeParse(json);
  if (!r.success) return { ok: false, erros: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  const n: NarracaoIA = r.data;
  const mapa = new Map(fatos.map((f) => [f.id, f]));
  const erros = [
    ...checarTrecho('titulo', n.titulo, mapa, false),
    ...n.bullets.flatMap((b, i) => checarTrecho(`bullet ${i + 1}`, b.texto, mapa, false)),
  ];
  if (n.hipotese) {
    if (!normalizar(n.hipotese).startsWith('hipotese')) erros.push('hipótese sem a marcação "Hipótese:"');
    erros.push(...checarTrecho('hipótese', n.hipotese, mapa, true));
  }
  if (erros.length) return { ok: false, erros };

  const texto: TextoResposta = {
    titulo: preencher(n.titulo, mapa),
    bullets: [...n.bullets.map((b) => preencher(b.texto, mapa)), ...(n.hipotese ? [preencher(n.hipotese, mapa)] : [])],
  };
  // Segunda trava: todo número do texto final está num fato.
  const soltos = [texto.titulo, ...texto.bullets].flatMap((b) => numerosNaoRastreaveis(b, fatos));
  if (soltos.length) return { ok: false, erros: soltos.map((s) => `número não rastreável: ${s}`) };
  return { ok: true, erros: [], texto };
}

export interface ResultadoNarracao {
  ok: boolean;
  texto?: TextoResposta;
  erros: string[];
  bruto: string;
  ms: number;
  versaoPrompt: string;
}

export async function narrarComIA(
  motor: MotorLLM,
  pergunta: string,
  tituloTemplate: string,
  fatos: readonly Fato[],
  aoParcial?: (t: string) => void,
): Promise<ResultadoNarracao> {
  const resposta = await motor.completar({
    mensagens: montarMensagensNarrador(pergunta, tituloTemplate, fatos),
    schemaJson: JSON.stringify(schemaNarracaoParaModelo(fatos.map((f) => f.id))),
    maxTokens: 320,
    aoParcial,
  });
  const v = validarNarracao(resposta.texto, fatos);
  return { ok: v.ok, texto: v.texto, erros: v.erros, bruto: resposta.texto, ms: resposta.ms, versaoPrompt: VERSAO_PROMPT_NARRADOR };
}
