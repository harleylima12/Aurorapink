/**
 * Detector de tema SEM IA (Camada 0 da Fase 5B). Função pura: recebe o perfil das colunas e devolve o tema,
 * a confiança e o porquê ("encontrei Valor Total, Produto, Data da Venda").
 *
 * Pontuação de cada tema:
 *   1. nome da coluna: a palavra mais forte do dicionário do tema que aparece no nome (cada coluna conta 1 vez);
 *   2. valores: sinais como "entrada/saída", "baixa/média/alta" ou códigos CID-10 na amostra de valores;
 *   3. tipos: um bônus pequeno (ex.: dinheiro reforça vendas e financeiro), que nunca decide sozinho.
 * Confiança = força do vencedor + distância para o 2º colocado. Abaixo de PONTOS_MINIMOS, o tema é "genérico".
 */
import { normalizar } from '../../router/normalizar';
import { palavras, type PerfilColuna, type TipoColuna } from '../perfil';
import { DEF_TEMAS, TEMAS, type Tema } from './definicoes';

export type NivelConfianca = 'alta' | 'media' | 'baixa';

export interface EvidenciaTema {
  /** Nome original da coluna (ou descrição do sinal de valor). */
  texto: string;
  pontos: number;
  fonte: 'nome' | 'valores' | 'tipo';
}

export interface ResultadoTema {
  tema: Tema;
  /** 0 a 1. */
  confianca: number;
  nivel: NivelConfianca;
  /** Frases curtas para a tela ("encontrei …"). */
  porque: string[];
  evidencias: EvidenciaTema[];
  /** Todos os temas com pontos, do maior para o menor (o genérico fica de fora). */
  ranking: { tema: Tema; pontos: number }[];
}

/** Menos que isso (≈ uma coluna forte e meia) não sustenta um tema: vira genérico. */
export const PONTOS_MINIMOS = 4;

type PerfilTema = Pick<PerfilColuna, 'original' | 'tipo' | 'amostraValores'>;

const BONUS_TIPO: Partial<Record<TipoColuna, Partial<Record<Tema, number>>>> = {
  dinheiro: { vendas: 0.5, financeiro: 0.5 },
  uf: { vendas: 0.5 },
  cidade: { vendas: 0.25 },
  porcentagem: { marketing: 0.25, educacao: 0.25 },
};

/** Maior peso de palavra do tema presente no nome da coluna (frases valem no nome inteiro). */
export function pontosDoNome(original: string, dicionario: Readonly<Record<string, number>>): number {
  const p = palavras(original);
  const inteiro = ` ${p.join(' ')} `;
  let melhor = 0;
  for (const [palavra, peso] of Object.entries(dicionario)) {
    const casa = palavra.includes(' ') ? inteiro.includes(` ${palavra} `) : p.includes(palavra);
    if (casa && peso > melhor) melhor = peso;
  }
  return melhor;
}

function pontuar(tema: Tema, perfis: readonly PerfilTema[]): { pontos: number; evidencias: EvidenciaTema[] } {
  const def = DEF_TEMAS[tema];
  const evidencias: EvidenciaTema[] = [];
  for (const perfil of perfis) {
    const n = pontosDoNome(perfil.original, def.palavras);
    if (n > 0) evidencias.push({ texto: perfil.original, pontos: n, fonte: 'nome' });
  }
  for (const sinal of def.valores ?? []) {
    // Cada sinal conta 1 vez, na coluna em que casar melhor.
    const casou = perfis.find((perfil) => {
      const amostra = perfil.amostraValores ?? [];
      if (amostra.length < 2) return false;
      const ok = amostra.filter((v) => (sinal.regex ? sinal.regex.test(v.trim()) : sinal.valores?.includes(normalizar(v).replace(/[^a-z0-9 ]+/g, ' ').trim())));
      return ok.length / amostra.length >= sinal.minimo;
    });
    if (casou) evidencias.push({ texto: `${sinal.descricao} em "${casou.original}"`, pontos: sinal.peso, fonte: 'valores' });
  }
  const temPalavra = evidencias.length > 0;
  if (temPalavra) {
    // O tipo só reforça um tema que já tem evidência (dinheiro sozinho não faz uma planilha de vendas).
    const vistos = new Set<TipoColuna>();
    for (const perfil of perfis) {
      const bonus = BONUS_TIPO[perfil.tipo]?.[tema];
      if (bonus && !vistos.has(perfil.tipo)) {
        vistos.add(perfil.tipo);
        evidencias.push({ texto: `coluna do tipo ${perfil.tipo}`, pontos: bonus, fonte: 'tipo' });
      }
    }
  }
  return { pontos: evidencias.reduce((s, e) => s + e.pontos, 0), evidencias };
}

const nivelDe = (c: number): NivelConfianca => (c >= 0.6 ? 'alta' : c >= 0.4 ? 'media' : 'baixa');

export function detectarTema(perfis: readonly PerfilTema[]): ResultadoTema {
  const todos = TEMAS.filter((t) => t !== 'generico').map((tema) => ({ tema, ...pontuar(tema, perfis) }));
  todos.sort((a, b) => b.pontos - a.pontos);
  const ranking = todos.filter((t) => t.pontos > 0).map(({ tema, pontos }) => ({ tema, pontos: Math.round(pontos * 100) / 100 }));
  const [primeiro, segundo] = todos;

  if (!primeiro || primeiro.pontos < PONTOS_MINIMOS) {
    // Genérico: confiança alta quando NADA parece tema; baixa quando algo quase chegou lá.
    const quase = primeiro?.pontos ?? 0;
    const confianca = Math.round(Math.max(0.3, 1 - quase / PONTOS_MINIMOS) * 100) / 100;
    return {
      tema: 'generico',
      confianca,
      nivel: nivelDe(confianca),
      porque: quase > 0 ? [`poucas pistas de tema (a mais forte: ${DEF_TEMAS[primeiro!.tema].rotulo}, ${quase} pontos)`] : ['nenhuma coluna com nome de um tema conhecido'],
      evidencias: primeiro?.evidencias ?? [],
      ranking,
    };
  }

  const forca = Math.min(1, primeiro.pontos / 10);
  const margem = (primeiro.pontos - (segundo?.pontos ?? 0)) / primeiro.pontos;
  const confianca = Math.round((0.4 * forca + 0.6 * margem) * 100) / 100;
  const nomes = primeiro.evidencias.filter((e) => e.fonte === 'nome').sort((a, b) => b.pontos - a.pontos).map((e) => e.texto);
  const valores = primeiro.evidencias.filter((e) => e.fonte === 'valores').map((e) => e.texto);
  const porque: string[] = [];
  if (nomes.length) porque.push(`encontrei ${lista(nomes.slice(0, 4))}${nomes.length > 4 ? ` e mais ${nomes.length - 4}` : ''}`);
  porque.push(...valores);
  return { tema: primeiro.tema, confianca, nivel: nivelDe(confianca), porque, evidencias: primeiro.evidencias, ranking };
}

/** "a, b e c". */
export function lista(itens: readonly string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}
