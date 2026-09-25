/**
 * Validador numérico ("zero números inventados"). Função pura.
 *
 * Todo número que aparece no texto precisa estar num fato (valor formatado ou rótulo, como
 * "nov/2017" ou "Casa e Conforto 2"). Na Fase 4 ele barra a saída da IA; aqui, garante que
 * nenhum template escapa da regra.
 */
import type { Fato } from '../insights/engine';

/** Trechos numéricos: "R$ 1,26 mi", "6,8%", "4,12", "2017", "+12,3%". */
const NUMERO = /[+−-]?(R\$\s?)?\d(?:[\d.,]*\d)?(\s?(mi|mil|bi)\b)?%?/g;

const limpar = (t: string) => t.replace(/[  ]/g, ' ').replace(/^[+−-]/, '').trim();

export function numerosNaoRastreaveis(texto: string, fatos: readonly Fato[], extras: readonly string[] = []): string[] {
  const fontes = [...fatos.flatMap((f) => [f.valor_formatado, f.rotulo]), ...extras].map(limpar);
  const achados = texto.replace(/[  ]/g, ' ').match(NUMERO) ?? [];
  return achados
    .map(limpar)
    .filter((n) => n.replace(/\D/g, '').length > 0)
    .filter((n) => !fontes.some((f) => f.includes(n)));
}
