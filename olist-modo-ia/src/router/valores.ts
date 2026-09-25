/**
 * SQL que lista os valores distintos reais das dimensões categóricas, para o roteador reconhecer
 * "beleza" como "Beleza e Saúde" e conferir filtros contra o que existe na base.
 * Os nomes de coluna vêm da camada semântica (configuração), nunca da pergunta.
 */
import type { Semantica } from '../semantic/schema';

export function consultaValoresDistintos(semantica: Semantica): { sql: string } {
  const partes = Object.entries(semantica.dimensions)
    .filter(([, d]) => d.type === 'categoria')
    .map(([id, d]) => {
      if (d.type !== 'categoria') return '';
      const expressao = d.column ? `"${d.column}"` : `(${d.sql ?? ''})`;
      return `SELECT DISTINCT '${id}' AS dimensao, CAST(${expressao} AS VARCHAR) AS valor FROM "${semantica.dataset.table}"`;
    });
  return { sql: `${partes.join('\nUNION ALL\n')}\nORDER BY dimensao, valor` };
}
