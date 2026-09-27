/**
 * Estado da escolha de tema na tela "Entendi assim" (Fase 5B): tema, objetivo, público e papéis.
 * Os papéis são recalculados quando o tipo de uma coluna muda; o que o usuário escolheu à mão (fixos) fica.
 */
import type { ColunaConfig, PerfilColuna } from '../perfil';
import type { EscolhaTema } from './aplicar';
import { DEF_PAPEIS, type PapelNegocio, type Tema } from './definicoes';
import { atribuirPapeis, type Papeis } from './papeis';
import { receitaDe } from './receitas';

/** O tipo que vale é o da configuração (o usuário pode ter corrigido o perfil). */
export function perfisDaConfig(perfis: readonly PerfilColuna[], config: readonly ColunaConfig[]): PerfilColuna[] {
  return perfis.map((p) => ({ ...p, tipo: config.find((c) => c.id === p.id)?.tipo ?? p.tipo }));
}

export function escolhaDoTema(tema: Tema, perfis: readonly PerfilColuna[], config: readonly ColunaConfig[], anterior: Partial<EscolhaTema> = {}): EscolhaTema {
  const receita = receitaDe(tema);
  const fixos = anterior.tema === tema || anterior.tema === undefined ? (anterior.fixos ?? {}) : {};
  const objetivo = receita?.objetivos.some((o) => o.id === anterior.objetivo) ? anterior.objetivo : undefined;
  return {
    tema,
    ...(objetivo ? { objetivo } : {}),
    ...(anterior.publico ? { publico: anterior.publico } : {}),
    fixos,
    papeis: receita ? atribuirPapeis(perfisDaConfig(perfis, config), receita.papeis, fixos) : {},
  };
}

/** Papel essencial sem coluna (vira a pergunta "Qual coluna é o valor…?"). Null se algum grupo essencial está completo. */
export function essencialFaltando(escolha: EscolhaTema): PapelNegocio | null {
  const receita = receitaDe(escolha.tema);
  if (!receita || !receita.essenciais.length) return null;
  const tem = (p: PapelNegocio) => Boolean(escolha.papeis[p]);
  if (receita.essenciais.some((g) => g.every(tem))) return null;
  const [primeiro] = receita.essenciais;
  // Se o usuário já disse "não tem", não pergunta de novo.
  return primeiro?.find((p) => !tem(p) && escolha.fixos?.[p] !== '') ?? null;
}

export const perguntaDoPapel = (p: PapelNegocio) => DEF_PAPEIS[p].pergunta;

export function fixar(escolha: EscolhaTema, papel: PapelNegocio, coluna: string, perfis: readonly PerfilColuna[], config: readonly ColunaConfig[]): EscolhaTema {
  const fixos: Papeis = { ...escolha.fixos, [papel]: coluna };
  return escolhaDoTema(escolha.tema, perfis, config, { ...escolha, fixos });
}
