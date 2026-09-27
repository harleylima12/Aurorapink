/**
 * Camada 1 (opcional) do tema da planilha (Fase 5B): a IA local SUGERE o tema, rótulos amigáveis e perguntas.
 *
 * - Entrada: só METADADOS (nome da coluna, tipo, quantos valores diferentes, % preenchido). Nunca linhas,
 *   nunca valores, nunca texto livre (P6). Dado pessoal aparece só como "dado pessoal".
 * - Saída: JSON preso a um JSON Schema e validado de novo com Zod; coluna que não existe é descartada.
 * - Regra de decisão: a IA só troca o tema quando a Camada 0 (nomes/valores) está com confiança MÉDIA ou BAIXA.
 * - Nenhum número vem da IA: o dashboard continua sendo a receita do tema, compilada e calculada pelo DuckDB.
 */
import type { ColunaConfig, PerfilColuna } from '../universal/perfil';
import { DEF_TEMAS, TEMAS, type Tema } from '../universal/temas/definicoes';
import type { ResultadoTema } from '../universal/temas/detector';
import { z } from '../zod';
import { extrairJson } from './planner';
import type { MensagemChat, MotorLLM } from './tipos';

export const VERSAO_PROMPT_TEMA = 'tema-v1';
export const MAX_TOKENS_TEMA = 320;

export interface MetadadoColuna {
  id: string;
  nome: string;
  tipo: string;
  distintos: number;
  preenchido_pct: number;
}

/** O que a IA vê. Conferido em teste: nenhum valor da planilha passa por aqui. */
export function metadadosParaIA(perfis: readonly PerfilColuna[], config: readonly ColunaConfig[]): MetadadoColuna[] {
  return perfis.map((p) => {
    const c = config.find((x) => x.id === p.id);
    const tipo = c?.tipo ?? p.tipo;
    return {
      id: p.id,
      nome: p.original.slice(0, 60),
      tipo: tipo === 'pessoal' ? 'dado pessoal' : tipo,
      distintos: p.distintos,
      preenchido_pct: Math.round((p.preenchidas / Math.max(1, p.linhas)) * 100),
    };
  });
}

export function schemaTemaParaModelo(ids: readonly string[]): string {
  return JSON.stringify({
    type: 'object',
    properties: {
      tema: { type: 'string', enum: [...TEMAS] },
      rotulos: {
        type: 'array',
        maxItems: 12,
        items: { type: 'object', properties: { coluna: { type: 'string', enum: [...ids] }, rotulo: { type: 'string', maxLength: 40 } }, required: ['coluna', 'rotulo'] },
      },
      perguntas: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 80 } },
    },
    required: ['tema', 'rotulos', 'perguntas'],
  });
}

const respostaTema = z.object({
  tema: z.enum(TEMAS),
  rotulos: z.array(z.object({ coluna: z.string(), rotulo: z.string().trim().min(1).max(40) })).max(12),
  perguntas: z.array(z.string().trim().min(3).max(80)).max(3),
});
export type SugestaoTemaIA = z.infer<typeof respostaTema>;

export function mensagensTema(meta: readonly MetadadoColuna[]): MensagemChat[] {
  const temas = TEMAS.map((t) => `${t} (${DEF_TEMAS[t].descricao})`).join('; ');
  return [
    {
      role: 'system',
      content:
        'Você classifica o TEMA de uma planilha só pelos METADADOS das colunas (nome, tipo, quantos valores diferentes). ' +
        `Temas possíveis: ${temas}. Responda SÓ com JSON: {"tema": ..., "rotulos": [{"coluna": id, "rotulo": nome curto e amigável em português}], ` +
        '"perguntas": [até 3 perguntas de negócio curtas que o dono da planilha faria]}. Não invente colunas. Não escreva números.',
    },
    { role: 'user', content: `COLUNAS: ${JSON.stringify(meta)}` },
  ];
}

export interface ResultadoTemaIA {
  sugestao: SugestaoTemaIA | null;
  erros: string[];
  bruto: string;
  ms: number;
  mensagens: MensagemChat[];
}

/** Validação pura: JSON quebrado, tema fora da lista ou coluna inventada nunca passam. */
export function validarTemaDoModelo(bruto: string, ids: readonly string[]): { sugestao: SugestaoTemaIA | null; erros: string[] } {
  let json: unknown;
  try {
    json = extrairJson(bruto);
  } catch (e) {
    return { sugestao: null, erros: [`JSON inválido: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const r = respostaTema.safeParse(json);
  if (!r.success) return { sugestao: null, erros: r.error.issues.map((i) => `${i.path.join('.') || 'resposta'}: ${i.message}`) };
  const erros: string[] = [];
  const rotulos = r.data.rotulos.filter((x) => {
    const ok = ids.includes(x.coluna);
    if (!ok) erros.push(`coluna inventada descartada: ${x.coluna}`);
    return ok;
  });
  // Pergunta com número "inventado" (ex.: "cresceu 15%?") não entra: números só vêm do DuckDB.
  const perguntas = r.data.perguntas.filter((q) => {
    const ok = !/\d/.test(q);
    if (!ok) erros.push(`pergunta com número descartada: ${q}`);
    return ok;
  });
  return { sugestao: { ...r.data, rotulos, perguntas }, erros };
}

export async function sugerirTemaIA(motor: MotorLLM, perfis: readonly PerfilColuna[], config: readonly ColunaConfig[]): Promise<ResultadoTemaIA> {
  const meta = metadadosParaIA(perfis, config);
  const ids = meta.map((m) => m.id);
  const mensagens = mensagensTema(meta);
  const t0 = performance.now();
  try {
    const r = await motor.completar({ mensagens, schemaJson: schemaTemaParaModelo(ids), maxTokens: MAX_TOKENS_TEMA });
    return { ...validarTemaDoModelo(r.texto, ids), bruto: r.texto, ms: performance.now() - t0, mensagens };
  } catch (e) {
    return { sugestao: null, erros: [`o modelo falhou: ${e instanceof Error ? e.message : String(e)}`], bruto: '', ms: performance.now() - t0, mensagens };
  }
}

/** Quem decide o tema: a Camada 0 com confiança alta ganha; senão, a sugestão da IA. */
export function combinarTema(camada0: ResultadoTema, ia: SugestaoTemaIA | null): { tema: Tema; fonte: 'camada0' | 'ia'; motivo: string } {
  if (!ia) return { tema: camada0.tema, fonte: 'camada0', motivo: 'sem sugestão válida da IA: vale a detecção por nomes' };
  if (camada0.nivel === 'alta') {
    return {
      tema: camada0.tema,
      fonte: 'camada0',
      motivo: ia.tema === camada0.tema ? 'a IA concordou com a detecção por nomes' : `a IA sugeriu ${DEF_TEMAS[ia.tema].rotulo}, mas a detecção por nomes estava com confiança alta`,
    };
  }
  return { tema: ia.tema, fonte: 'ia', motivo: `a detecção por nomes estava com confiança ${camada0.nivel === 'media' ? 'média' : 'baixa'}, então usei a sugestão da IA` };
}
