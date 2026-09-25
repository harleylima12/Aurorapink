/** Normalização de texto em PT-BR para o roteador (funções puras). */

/** Minúsculas, sem acento, "1º" -> "1o", pontuação vira espaço (mantém "/" e "%"). */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, 'o')
    .replace(/[?!.,;:()[\]{}"“”'’`´\-–—_*+=<>|\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Radical simples: tira o "s" do plural ("categorias" -> "categoria"). Aplicado dos dois lados. */
export function radical(palavra: string): string {
  if (palavra.length > 3 && palavra.endsWith('s') && !palavra.endsWith('ss')) return palavra.slice(0, -1);
  return palavra;
}

export function tokens(textoNormalizado: string): string[] {
  return textoNormalizado.split(' ').filter(Boolean);
}

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, vinte: 20, trinta: 30,
};

/** "5" -> 5, "cinco" -> 5, qualquer outra coisa -> null. */
export function numero(palavra: string): number | null {
  if (/^\d+$/.test(palavra)) return Number(palavra);
  return NUMEROS[palavra] ?? null;
}

export const PALAVRAS_NUMERO = Object.keys(NUMEROS).join('|');

/** Palavras que não carregam significado para a consulta (não contam como "palavra desconhecida"). */
export const PARADA = new Set(
  (
    'a o os as um uma uns umas de do da dos das em no na nos nas num numa por pelo pela pelos pelas para pra pro ' +
    'com sem e ou que qual quais quanto quanta quantos quantas como onde quando foi foram era e ser sao esta estao ' +
    'tem teve ter tiveram houve ha me mostra mostre mostrar ver veja quero queria gostaria saber sobre isso esse essa ' +
    'este esta estes essas esses nosso nossa nossos nossas meu minha voce voces vc vcs gente ai entao tipo la aqui ' +
    'cada geral tudo todo todos todas toda ja ainda so somente apenas entre durante ao aos se nao sim bem muito muita ' +
    'favor por favor pls dados base loja olist valor valores numero numeros quantidade total mes ano periodo dia ' +
    'agora hoje vez vezes lado seu sua seus suas dele dela nele nela qual e o aquele aquela coisa coisas ' +
    'vendemos vendeu venderam faturamos faturou faturaram teve tivemos temos fizemos fez anda andou estamos estou ' +
    'pago pagos paga pagas recebeu receberam recebido compraram comprou entrou entraram gerou geraram registrou ' +
    'unico unicos fica ficou ficaram deu deram tiver ter tido cliente'
  )
    .split(' ')
    .filter(Boolean),
);
