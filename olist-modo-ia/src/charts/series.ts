/** Ajustes de série temporal para os gráficos (funções puras). */
import type { Linha } from '../data/duckdb';

export interface MetricaSerie {
  id: string;
  /** Soma/contagem: mês sem linha vale 0. Média/percentual: mês sem linha fica vazio. */
  zeroQuandoVazio: boolean;
}

function proximoMes(iso: string): string {
  const [ano, mes] = iso.split('-').map(Number);
  if (!ano || !mes) throw new Error(`mês inválido: ${iso}`);
  return mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
}

/**
 * Completa os meses que não aparecem no resultado (ex.: nov/2016 não tem nenhum
 * pedido na Olist). Sem isso, o eixo pularia o mês e o gráfico mentiria.
 */
export function completarMeses(linhas: readonly Linha[], chaveTempo: string, metricas: readonly MetricaSerie[]): Linha[] {
  const porMes = new Map(linhas.map((l) => [String(l[chaveTempo]), l]));
  const meses = [...porMes.keys()].sort();
  const primeiro = meses[0];
  const ultimo = meses.at(-1);
  if (!primeiro || !ultimo) return [];
  const resultado: Linha[] = [];
  for (let mes = primeiro; mes <= ultimo; mes = proximoMes(mes)) {
    const existente = porMes.get(mes);
    resultado.push(
      existente ?? {
        [chaveTempo]: mes,
        ...Object.fromEntries(metricas.map((m) => [m.id, m.zeroQuandoVazio ? 0 : null])),
      },
    );
  }
  return resultado;
}

/** Trechos contínuos do eixo marcados como "poucos dados" (viram faixas sombreadas no gráfico). */
export function faixasParciais(eixo: readonly string[], parciais: ReadonlySet<string>): [string, string][] {
  const faixas: [string, string][] = [];
  let inicio: string | null = null;
  let anterior: string | null = null;
  for (const valor of eixo) {
    if (parciais.has(valor)) {
      inicio ??= valor;
      anterior = valor;
    } else if (inicio !== null && anterior !== null) {
      faixas.push([inicio, anterior]);
      inicio = null;
    }
  }
  if (inicio !== null && anterior !== null) faixas.push([inicio, anterior]);
  return faixas;
}
