/** Filtros da barra lateral (Ano, Estado) e o estado da URL. Funções puras. */
import { periodoDoAno } from '../query/periodo';
import type { QuerySpec } from '../query/spec';
import type { IdPagina } from './paginas';

export interface Filtros {
  ano: number | null;
  uf: string | null;
}

export const SEM_FILTROS: Filtros = { ano: null, uf: null };

/** Aplica os filtros da barra lateral em cima do spec de um visual. */
export function aplicarFiltros(spec: QuerySpec, filtros: Filtros): QuerySpec {
  let resultado = spec;
  if (filtros.ano !== null) {
    resultado = { ...resultado, time: { ...resultado.time, ...periodoDoAno(filtros.ano) } };
  }
  if (filtros.uf !== null) {
    resultado = {
      ...resultado,
      filters: [...resultado.filters, { dimension: 'estado_cliente', op: 'in', values: [filtros.uf] }],
    };
  }
  return resultado;
}

const CAMINHOS: Record<IdPagina, string> = {
  'visao-geral': '/',
  produtos: '/produtos',
  logistica: '/logistica',
};

export interface Local {
  pagina: IdPagina;
  filtros: Filtros;
}

export function lerLocal(caminho: string, busca: string): Local {
  const normalizado = caminho.replace(/\/+$/, '') || '/';
  const pagina = (Object.keys(CAMINHOS) as IdPagina[]).find((id) => CAMINHOS[id] === normalizado) ?? 'visao-geral';
  const parametros = new URLSearchParams(busca);
  const ano = Number(parametros.get('ano'));
  const uf = (parametros.get('uf') ?? '').toUpperCase();
  return {
    pagina,
    filtros: {
      ano: Number.isInteger(ano) && ano >= 2000 && ano <= 2100 ? ano : null,
      uf: /^[A-Z]{2}$/.test(uf) ? uf : null,
    },
  };
}

export function montarUrl({ pagina, filtros }: Local): string {
  const parametros = new URLSearchParams();
  if (filtros.ano !== null) parametros.set('ano', String(filtros.ano));
  if (filtros.uf !== null) parametros.set('uf', filtros.uf);
  const busca = parametros.toString();
  return `${CAMINHOS[pagina]}${busca ? `?${busca}` : ''}`;
}
