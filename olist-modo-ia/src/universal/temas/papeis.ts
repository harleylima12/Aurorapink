/**
 * Papéis de negócio (Fase 5B): qual coluna é o "valor da venda", o "produto", a "data"...
 * Função pura sobre o perfil. Uma coluna só pode ter um papel, e só entra se o TIPO bate (dinheiro para valor,
 * data para data). O que ficar sem coluna vira pergunta na tela "Entendi assim" ou painel escondido (nunca chute).
 */
import { normalizar } from '../../router/normalizar';
import { palavras, type PerfilColuna } from '../perfil';
import { DEF_PAPEIS, type PapelNegocio } from './definicoes';

export type Papeis = Partial<Record<PapelNegocio, string>>;

type PerfilPapel = Pick<PerfilColuna, 'id' | 'original' | 'tipo' | 'amostraValores' | 'preenchidas' | 'linhas'>;

/** Nota de uma coluna para um papel (0 = não serve). Palavras do começo da lista valem um pouco mais. */
export function notaPapel(papel: PapelNegocio, perfil: PerfilPapel): number {
  const def = DEF_PAPEIS[papel];
  if (!def.tipos.includes(perfil.tipo)) return 0;
  const p = palavras(perfil.original);
  const inteiro = ` ${p.join(' ')} `;
  const casa = (w: string) => (w.includes(' ') ? inteiro.includes(` ${w} `) : p.includes(w));
  if (def.evitar?.some(casa)) return 0;
  let nota = 0;
  def.palavras.forEach((w, i) => {
    if (casa(w)) nota = Math.max(nota, 2 + (def.palavras.length - i) / def.palavras.length);
  });
  if (def.valores && perfil.amostraValores && perfil.amostraValores.length >= 2) {
    const ok = perfil.amostraValores.filter((v) => def.valores!.includes(normalizar(v).replace(/[^a-z0-9 ]+/g, ' ').trim()));
    if (ok.length / perfil.amostraValores.length >= 0.6) nota += 3;
  }
  // Data: qualquer coluna de data serve (a mais preenchida ganha), mesmo sem nome conhecido.
  if (papel === 'data' && nota === 0) nota = 0.5;
  if (nota === 0) return 0;
  return nota + perfil.preenchidas / Math.max(1, perfil.linhas) / 10;
}

/**
 * Distribui os papéis pedidos entre as colunas: primeiro os pares com a maior nota; empate fica com o papel que
 * vem antes na lista (a receita lista primeiro os mais importantes). `fixos` (escolhas do usuário) vêm antes de tudo.
 */
export function atribuirPapeis(perfis: readonly PerfilPapel[], pedidos: readonly PapelNegocio[], fixos: Papeis = {}): Papeis {
  const saida: Papeis = {};
  const usadas = new Set<string>();
  for (const [papel, coluna] of Object.entries(fixos) as [PapelNegocio, string][]) {
    if (pedidos.includes(papel) && perfis.some((x) => x.id === coluna)) {
      saida[papel] = coluna;
      usadas.add(coluna);
    }
  }
  const pares: { papel: PapelNegocio; coluna: string; nota: number; ordem: number }[] = [];
  pedidos.forEach((papel, ordem) => {
    if (saida[papel] || papel in fixos) return;
    for (const perfil of perfis) {
      const nota = notaPapel(papel, perfil);
      if (nota > 0) pares.push({ papel, coluna: perfil.id, nota, ordem });
    }
  });
  pares.sort((a, b) => b.nota - a.nota || a.ordem - b.ordem);
  for (const par of pares) {
    if (saida[par.papel] || usadas.has(par.coluna)) continue;
    saida[par.papel] = par.coluna;
    usadas.add(par.coluna);
  }
  return saida;
}

/** Colunas que PODEM ter o papel (para o menu "Qual coluna é …?"): o tipo precisa bater. */
export function candidatas(papel: PapelNegocio, perfis: readonly PerfilPapel[]): PerfilPapel[] {
  return perfis.filter((x) => DEF_PAPEIS[papel].tipos.includes(x.tipo));
}
