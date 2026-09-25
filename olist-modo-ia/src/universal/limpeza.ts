/**
 * Limpeza automática (seção 7A, item 3). Funções puras que geram nomes e SQL; quem roda é o DuckDB.
 *
 * - nomes de coluna viram identificadores seguros ("  VALOR (R$) " -> valor_r); o rótulo original fica para a tela;
 * - linhas vazias e linhas de total/subtotal saem ("Total", "Subtotal 03/2024", "TOTAL GERAL");
 * - colunas 100% vazias saem.
 * O relatório diz exatamente o que foi corrigido.
 */
import { normalizar } from '../router/normalizar';

export interface ColunaBruta {
  /** Identificador seguro (a-z, 0-9, _): vira nome de coluna no SQL. */
  id: string;
  /** Texto original do cabeçalho, sem espaços sobrando. */
  original: string;
}

const RESERVADAS = new Set(['linha_planilha', 'select', 'from', 'where', 'group', 'order', 'by', 'limit', 'table', 'and', 'or', 'not', 'null', 'case', 'when', 'end', 'as', 'in', 'is']);

export function idDeColuna(texto: string, i: number): string {
  let id = normalizar(texto.replace(/(^|\s)n\s?[º°]\s*/gi, '$1numero ').replace(/%/g, ' pct '))
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '');
  if (!id) id = `coluna_${i + 1}`;
  if (/^\d/.test(id)) id = `c_${id}`;
  if (RESERVADAS.has(id) || id.startsWith('_')) id = `${id}_col`;
  return id;
}

/** Nomes únicos: o segundo "loja" vira "loja_2". */
export function colunasBrutas(nomes: readonly string[]): ColunaBruta[] {
  const usados = new Set<string>();
  return nomes.map((n, i) => {
    const original = n.replace(/\s+/g, ' ').trim() || `Coluna ${i + 1}`;
    const base = idDeColuna(original, i);
    let id = base;
    for (let k = 2; usados.has(id); k++) id = `${base}_${k}`;
    usados.add(id);
    return { id, original };
  });
}

/** Aspas duplas de identificador (os ids já são seguros; isto é defesa extra). */
export const ident = (id: string) => `"${id.replace(/"/g, '""')}"`;
/** Literal de texto para SQL (só para configuração gerada pelo app, nunca para valor digitado). */
export const literal = (t: string) => `'${t.replace(/'/g, "''")}'`;

export interface OpcoesCsv {
  arquivo: string;
  separador: string;
  pular: number;
  colunas: readonly ColunaBruta[];
}

/** Tabela crua: tudo VARCHAR, colunas com os nossos nomes, linhas curtas completadas com NULL. */
export function sqlTabelaCrua(tabela: string, o: OpcoesCsv): string {
  const nomes = o.colunas.map((c) => literal(c.id)).join(', ');
  return (
    `CREATE OR REPLACE TABLE ${ident(tabela)} AS SELECT * FROM read_csv(${literal(o.arquivo)}, ` +
    `delim=${literal(o.separador)}, header=false, skip=${o.pular}, all_varchar=true, null_padding=true, ` +
    `strict_mode=false, quote='"', escape='"', names=[${nomes}])`
  );
}

const vazia = (id: string) => `NULLIF(TRIM(${ident(id)}), '') IS NULL`;
export const REGEX_TOTAL = '^\\s*(sub\\s*-?\\s*)?total\\b';

/** Linha de total: a 1ª ou 2ª coluna começa com "total"/"subtotal". */
export function condicaoTotal(colunas: readonly ColunaBruta[]): string {
  const alvo = colunas.slice(0, 2).map((c) => `regexp_matches(lower(strip_accents(COALESCE(${ident(c.id)}, ''))), ${literal(REGEX_TOTAL)})`);
  return alvo.length ? `(${alvo.join(' OR ')})` : 'false';
}

export function condicaoVazia(colunas: readonly ColunaBruta[]): string {
  return colunas.length ? `(${colunas.map((c) => vazia(c.id)).join(' AND ')})` : 'true';
}

export interface RelatorioLimpeza {
  linhasTitulo: number;
  linhasVazias: number;
  linhasTotal: number;
  colunasVazias: string[];
  nomesCorrigidos: { original: string; id: string }[];
  codificacao: string;
  separador: string;
}

export function sqlContagemLimpeza(tabela: string, colunas: readonly ColunaBruta[]): string {
  return (
    `SELECT COUNT(*) FILTER (WHERE ${condicaoVazia(colunas)}) AS vazias, ` +
    `COUNT(*) FILTER (WHERE NOT ${condicaoVazia(colunas)} AND ${condicaoTotal(colunas)}) AS totais, ` +
    `COUNT(*) AS linhas` +
    (colunas.length ? `, ${colunas.map((c) => `COUNT(NULLIF(TRIM(${ident(c.id)}), '')) AS ${ident(`n_${c.id}`)}`).join(', ')}` : '') +
    ` FROM ${ident(tabela)}`
  );
}

/** Remove vazias e totais; devolve o SQL (a tabela limpa substitui a crua). */
export function sqlLimpar(tabela: string, colunas: readonly ColunaBruta[]): string {
  return `DELETE FROM ${ident(tabela)} WHERE ${condicaoVazia(colunas)} OR ${condicaoTotal(colunas)}`;
}

export function descreverRelatorio(r: RelatorioLimpeza): string[] {
  const itens: string[] = [];
  const sep = r.separador === '\t' ? 'tabulação' : `"${r.separador}"`;
  itens.push(`Arquivo em ${r.codificacao === 'latin-1' ? 'Latin-1 (padrão do Excel no Brasil), convertido para UTF-8' : 'UTF-8'}, separador ${sep}.`);
  if (r.linhasTitulo) itens.push(`${r.linhasTitulo} ${r.linhasTitulo === 1 ? 'linha de título pulada' : 'linhas de título puladas'} antes do cabeçalho.`);
  if (r.linhasVazias) itens.push(`${r.linhasVazias} ${r.linhasVazias === 1 ? 'linha vazia removida' : 'linhas vazias removidas'}.`);
  if (r.linhasTotal) itens.push(`${r.linhasTotal} ${r.linhasTotal === 1 ? 'linha de total/subtotal removida' : 'linhas de total/subtotal removidas'} (evita contar em dobro).`);
  if (r.colunasVazias.length) itens.push(`${r.colunasVazias.length} ${r.colunasVazias.length === 1 ? 'coluna vazia ignorada' : 'colunas vazias ignoradas'}.`);
  const renomeadas = r.nomesCorrigidos.filter((n) => n.original.trim() !== n.original || /\s{2,}/.test(n.original));
  if (renomeadas.length) itens.push(`${renomeadas.length} ${renomeadas.length === 1 ? 'nome de coluna com espaços sobrando corrigido' : 'nomes de coluna com espaços sobrando corrigidos'}.`);
  return itens;
}
