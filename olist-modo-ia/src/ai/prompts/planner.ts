/**
 * Prompt do PLANEJADOR (Camada 1). Versionado: mudou o texto, muda a versão (fica registrada em
 * "Como calculei" e na avaliação da Fase 7).
 *
 * Enxuto de propósito (menos texto = resposta mais rápida numa GPU fraca): só as métricas e
 * dimensões candidatas + de 6 a 8 exemplos parecidos com a pergunta.
 */
import Fuse from 'fuse.js';

import type { QuerySpec } from '../../query/spec';
import { normalizar, radical, tokens } from '../../router/normalizar';
import type { Semantica } from '../../semantic/schema';
import type { MensagemChat } from '../tipos';
import { EXEMPLOS, type Exemplo } from './exemplos';

export const VERSAO_PROMPT_PLANEJADOR = 'planejador-v1';

export interface EntradaPromptPlanejador {
  semantica: Semantica;
  pergunta: string;
  anterior: QuerySpec | null;
  ancora: string;
  valores: Readonly<Record<string, readonly string[]>>;
  maxMetricas?: number;
  maxDimensoes?: number;
  maxExemplos?: number;
  /** Few-shots da base (planilha do Modo Universal); padrão: os da Olist. */
  exemplos?: readonly Exemplo[];
}

/** Texto do banco vai para o prompt só como rótulo curto e sem caracteres de controle (P6). */
export function rotuloSeguro(texto: string, max = 60): string {
  return texto.replace(/[\u0000-\u001f\u007f<>{}`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function candidatos<T extends { id: string; texto: string }>(itens: T[], pergunta: string, max: number, sempre: string[]): T[] {
  const fuse = new Fuse(itens, { keys: ['texto'], threshold: 0.6, ignoreLocation: true, includeScore: true });
  const palavras = tokens(normalizar(pergunta)).map(radical).filter((p) => p.length > 2);
  const pontos = new Map<string, number>();
  for (const p of palavras) for (const r of fuse.search(p)) pontos.set(r.item.id, (pontos.get(r.item.id) ?? 0) + (1 - (r.score ?? 1)));
  const ordenados = [...itens].sort((a, b) => (pontos.get(b.id) ?? 0) - (pontos.get(a.id) ?? 0));
  const escolhidos = [...itens.filter((i) => sempre.includes(i.id)), ...ordenados.filter((i) => !sempre.includes(i.id))];
  return escolhidos.slice(0, max);
}

export function selecionarExemplos(pergunta: string, max: number, exemplos: readonly Exemplo[] = EXEMPLOS): Exemplo[] {
  const alvo = new Set(tokens(normalizar(pergunta)).map(radical));
  const nota = (e: Exemplo) => tokens(normalizar(e.pergunta)).map(radical).filter((t) => alvo.has(t)).length;
  const fixos = exemplos.filter((e) => e.fixo);
  const outros = exemplos.filter((e) => !e.fixo).sort((a, b) => nota(b) - nota(a));
  return [...outros.slice(0, Math.max(0, max - fixos.length)), ...fixos];
}

export function montarMensagensPlanejador(e: EntradaPromptPlanejador): MensagemChat[] {
  const { semantica } = e;
  const metricas = candidatos(
    Object.entries(semantica.metrics).map(([id, m]) => ({ id, texto: [m.label, ...m.synonyms].join(' '), m })),
    e.pergunta,
    e.maxMetricas ?? 7,
    ['faturamento', 'pedidos'],
  );
  const dimensoes = candidatos(
    Object.entries(semantica.dimensions).map(([id, d]) => ({ id, texto: [d.label, ...d.synonyms].join(' '), d })),
    e.pergunta,
    e.maxDimensoes ?? 6,
    ['tempo'],
  );
  const listaValores = dimensoes
    .filter(({ d }) => d.type === 'categoria')
    .map(({ id }) => {
      const reais = e.valores[id] ?? [];
      if (!reais.length || reais.length > 40) {
        // Muitos valores (categorias, cidades): só os que parecem com a pergunta.
        const fuse = new Fuse([...reais], { threshold: 0.4, ignoreLocation: true });
        const achados = tokens(normalizar(e.pergunta))
          .filter((t) => t.length > 3)
          .flatMap((t) => fuse.search(t).slice(0, 2).map((r) => r.item));
        const unicos = [...new Set(achados)].slice(0, 6);
        return unicos.length ? `${id}: ${unicos.map((v) => rotuloSeguro(v)).join(' | ')}` : '';
      }
      return `${id}: ${reais.map((v) => rotuloSeguro(v)).join(' | ')}`;
    })
    .filter(Boolean);

  const sistema = [
    `Você converte perguntas em português sobre os dados de ${semantica.dataset.name} (${semantica.dataset.description}) em um JSON QuerySpec.`,
    'Regras:',
    '- Use SOMENTE as métricas e dimensões listadas em CATÁLOGO, pelo id.',
    '- Não calcule nada e não escreva números que não estejam na pergunta.',
    `- Datas relativas usam como "hoje" ${e.ancora} (última data completa dos dados). Datas no formato AAAA-MM-DD.`,
    '- Pergunta impossível com o catálogo (lucro, custo, estoque...) → intent "fora_de_escopo" com o motivo em out_of_scope_reason.',
    '- Pergunta vaga → intent "esclarecer" com clarify.question e até 3 clarify.options curtas.',
    '- Se houver SPEC_ANTERIOR e a pergunta for um complemento ("e só em SP?", "e em 2018?"), modifique o SPEC_ANTERIOR.',
    '- Em filtros, use os valores exatamente como aparecem em VALORES.',
    'Responda apenas com o JSON.',
    '',
    'CATÁLOGO',
    'métricas:',
    ...metricas.map(({ id, m }) => `- ${id}: ${m.label} (${m.description})`),
    'dimensões:',
    ...dimensoes.map(({ id, d }) => `- ${id}: ${d.label}${d.type === 'tempo' ? ` (grãos: ${d.grains.join(', ')})` : ''}`),
    ...(listaValores.length ? ['VALORES', ...listaValores] : []),
  ].join('\n');

  const mensagens: MensagemChat[] = [{ role: 'system', content: sistema }];
  for (const ex of selecionarExemplos(e.pergunta, e.maxExemplos ?? 8, e.exemplos)) {
    mensagens.push({ role: 'user', content: `SPEC_ANTERIOR: ${ex.anterior ? JSON.stringify(ex.anterior) : 'null'}\nPERGUNTA: ${ex.pergunta}` });
    mensagens.push({ role: 'assistant', content: JSON.stringify(ex.spec) });
  }
  mensagens.push({ role: 'user', content: `SPEC_ANTERIOR: ${e.anterior ? JSON.stringify(e.anterior) : 'null'}\nPERGUNTA: ${rotuloSeguro(e.pergunta, 300)}` });
  return mensagens;
}
