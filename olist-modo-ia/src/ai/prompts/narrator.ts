/**
 * Prompt do NARRADOR da IA. O modelo recebe só FATOS (id, tipo, rótulo e sentido), nunca linhas
 * da base nem os números: ele escreve o texto com placeholders {{id}} e o app preenche os valores.
 */
import type { Fato } from '../../insights/engine';
import type { MensagemChat } from '../tipos';
import { rotuloSeguro } from './planner';

export const VERSAO_PROMPT_NARRADOR = 'narrador-v1';

export function montarMensagensNarrador(pergunta: string, tituloTemplate: string, fatos: readonly Fato[]): MensagemChat[] {
  const lista = fatos.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    sobre: rotuloSeguro(f.rotulo).replace(/\d/g, '#'),
    sentido: f.valor > 0 ? 'positivo' : f.valor < 0 ? 'negativo' : 'zero',
    importancia: Math.round(f.importancia * 10) / 10,
  }));
  const sistema = [
    'Você escreve a análise de um dashboard em português do Brasil, em tom executivo.',
    'Regras (obrigatórias):',
    '- Use SOMENTE os fatos da lista. Não escreva nenhum dígito, número por extenso, data nem mês.',
    '- Para citar um valor, escreva {{id}}. Para citar a que o fato se refere, escreva {{id.rotulo}}.',
    '- No máximo 4 bullets curtos; em cada bullet, liste em "fatos" os ids citados.',
    '- Não afirme causas. Se quiser sugerir uma causa, use o campo "hipotese", começando por "Hipótese:".',
    'Responda apenas com o JSON.',
  ].join('\n');
  const usuario = JSON.stringify({ pergunta: rotuloSeguro(pergunta, 300), titulo_sugerido: rotuloSeguro(tituloTemplate, 90).replace(/\d/g, '#'), fatos: lista });
  return [
    { role: 'system', content: sistema },
    {
      role: 'user',
      content: JSON.stringify({
        pergunta: 'top categorias',
        titulo_sugerido: 'Faturamento por categoria',
        fatos: [
          { id: 'primeiro', tipo: 'lider', sobre: 'Beleza e Saúde', sentido: 'positivo', importancia: 1 },
          { id: 'primeiro_share', tipo: 'participacao', sobre: 'Beleza e Saúde', sentido: 'positivo', importancia: 0.9 },
        ],
      }),
    },
    {
      role: 'assistant',
      content: JSON.stringify({
        titulo: 'Quem lidera o faturamento',
        bullets: [{ texto: '{{primeiro.rotulo}} lidera com {{primeiro}}, o equivalente a {{primeiro_share}} do total.', fatos: ['primeiro', 'primeiro_share'] }],
      }),
    },
    { role: 'user', content: usuario },
  ];
}
