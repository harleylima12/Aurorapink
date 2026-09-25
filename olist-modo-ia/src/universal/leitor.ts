/**
 * Leitura inteligente de CSV (seção 7A, item 2). Funções puras, rodam só no começo do arquivo.
 *
 * O JS decide o que o DuckDB não adivinha bem numa planilha brasileira: a codificação (UTF-8 ou
 * Latin-1, a do "CSV do Excel"), o separador e em que linha está o cabeçalho (pulando títulos).
 * O arquivo inteiro é lido depois pelo próprio DuckDB, tudo como texto (ajuste 12 da Fase 0).
 */

export type Codificacao = 'utf-8' | 'latin-1';

export interface TextoDecodificado {
  texto: string;
  codificacao: Codificacao;
}

/** UTF-8 válido? Então é UTF-8. Senão, Windows-1252 (o "Latin-1" que o Excel brasileiro grava). */
export function decodificar(bytes: Uint8Array): TextoDecodificado {
  try {
    return { texto: new TextDecoder('utf-8', { fatal: true }).decode(bytes), codificacao: 'utf-8' };
  } catch {
    return { texto: new TextDecoder('windows-1252').decode(bytes), codificacao: 'latin-1' };
  }
}

export interface RegistroCsv {
  celulas: string[];
  /** Linha física (0 = primeira) onde o registro termina: o DuckDB pula por linhas físicas. */
  linhaFinal: number;
}

/** Parser CSV (RFC 4180: aspas, aspas dobradas, quebra de linha dentro de aspas). Para em `max` registros. */
export function lerRegistros(texto: string, separador: string, max = Infinity): RegistroCsv[] {
  const registros: RegistroCsv[] = [];
  let celulas: string[] = [];
  let atual = '';
  let aspas = false;
  let linha = 0;
  const fechar = () => {
    celulas.push(atual);
    registros.push({ celulas, linhaFinal: linha });
    celulas = [];
    atual = '';
  };
  for (let i = 0; i < texto.length && registros.length < max; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          atual += '"';
          i++;
        } else aspas = false;
      } else {
        if (c === '\n') linha++;
        atual += c;
      }
      continue;
    }
    if (c === '"' && atual.trim() === '') {
      atual = '';
      aspas = true;
    } else if (c === separador) {
      celulas.push(atual);
      atual = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fechar();
      linha++;
    } else atual += c;
  }
  if ((atual !== '' || celulas.length) && registros.length < max) fechar();
  return registros;
}

export const SEPARADORES = [',', ';', '\t', '|'] as const;

/**
 * Separador: o que divide as linhas no MESMO número de colunas (> 1) com mais frequência.
 * Empate: ";" ganha de "," (no Brasil, "," costuma ser decimal).
 */
export function detectarSeparador(texto: string): string {
  const amostra = texto.slice(0, 64 * 1024);
  let melhor: { sep: string; nota: number } = { sep: ',', nota: -1 };
  for (const sep of SEPARADORES) {
    const larguras = lerRegistros(amostra, sep, 60)
      .map((r) => r.celulas.filter((c) => c.trim() !== '').length)
      .filter((n) => n > 0);
    if (!larguras.length) continue;
    const contagem = new Map<number, number>();
    for (const n of larguras) contagem.set(n, (contagem.get(n) ?? 0) + 1);
    const [moda, vezes] = [...contagem].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [1, 0];
    if (moda < 2) continue;
    const nota = (vezes / larguras.length) * Math.log2(moda + 1) + (sep === ';' ? 0.001 : 0);
    if (nota > melhor.nota) melhor = { sep, nota };
  }
  return melhor.sep;
}

const pareceNumeroOuData = (c: string) => /^[\s(R$+−-]*[\d.,/:%-]+\s*%?\)?$/.test(c.trim());

export type AvisoLeitura = 'varias_tabelas' | 'poucas_linhas' | 'sem_cabecalho';

export interface Cabecalho {
  /** Índice do registro de cabeçalho (0 = primeiro). */
  indice: number;
  /** Quantas linhas FÍSICAS o DuckDB deve pular para cair na primeira linha de dados. */
  pular: number;
  nomes: string[];
  largura: number;
  avisos: AvisoLeitura[];
}

/**
 * Cabeçalho = primeiro registro com várias células preenchidas, quase todas texto (não número/data),
 * e seguido por linhas de largura parecida. Títulos ("Relatório 2023") têm uma célula só: ficam para trás.
 */
export function acharCabecalho(registros: RegistroCsv[]): Cabecalho {
  const preenchidas = (r: RegistroCsv) => r.celulas.filter((c) => c.trim() !== '').length;
  const larguraTotal = Math.max(0, ...registros.map((r) => {
    let fim = r.celulas.length;
    while (fim > 0 && (r.celulas[fim - 1] ?? '').trim() === '') fim--;
    return fim;
  }));
  const larguraTipica = (() => {
    const cont = new Map<number, number>();
    for (const r of registros.slice(0, 200)) {
      const n = preenchidas(r);
      if (n > 1) cont.set(n, (cont.get(n) ?? 0) + 1);
    }
    return [...cont].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 1;
  })();

  let indice = registros.findIndex((r, i) => {
    const celulas = r.celulas.filter((c) => c.trim() !== '');
    if (celulas.length < Math.max(2, Math.ceil(larguraTipica * 0.6))) return false;
    const textos = celulas.filter((c) => !pareceNumeroOuData(c)).length;
    if (textos / celulas.length < 0.8) return false;
    const seguintes = registros.slice(i + 1, i + 6).filter((s) => preenchidas(s) > 0);
    return seguintes.length === 0 || seguintes.some((s) => preenchidas(s) >= Math.ceil(celulas.length * 0.5));
  });
  const avisos: AvisoLeitura[] = [];
  if (indice < 0) {
    indice = 0;
    avisos.push('sem_cabecalho');
  }
  const cab = registros[indice];
  const nomes = Array.from({ length: larguraTotal }, (_, i) => (cab?.celulas[i] ?? '').trim());

  // Várias tabelas na mesma aba: coluna vazia no meio do cabeçalho, com colunas preenchidas dos dois lados,
  // ou o mesmo nome de coluna repetido depois do buraco.
  const ultimaCheia = nomes.reduce((u, n, i) => (n ? i : u), -1);
  const buracos = nomes.slice(0, ultimaCheia).map((n, i) => (n === '' ? i : -1)).filter((i) => i > 0);
  const buracoVazioNosDados = buracos.some((b) => registros.slice(indice + 1, indice + 30).every((r) => (r.celulas[b] ?? '').trim() === ''));
  if (buracos.length && buracoVazioNosDados) avisos.push('varias_tabelas');

  const dados = registros.slice(indice + 1).filter((r) => preenchidas(r) > 0);
  if (dados.length < 2) avisos.push('poucas_linhas');
  return { indice, pular: (cab?.linhaFinal ?? -1) + 1, nomes, largura: larguraTotal, avisos };
}

export interface PlanoLeitura {
  codificacao: Codificacao;
  separador: string;
  cabecalho: Cabecalho;
  /** Primeiros registros de dados (para o perfil rápido e a prévia). */
  amostra: string[][];
}

/** Tudo que o app decide antes de entregar o arquivo ao DuckDB. Olha só o começo (até 2.000 registros). */
export function planejarLeitura(texto: string, codificacao: Codificacao): PlanoLeitura {
  const separador = detectarSeparador(texto);
  const registros = lerRegistros(texto.slice(0, 2 * 1024 * 1024), separador, 2000);
  const cabecalho = acharCabecalho(registros);
  const amostra = registros.slice(cabecalho.indice + 1).map((r) => r.celulas);
  return { codificacao, separador, cabecalho, amostra };
}
