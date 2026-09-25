/**
 * Âncora de datas: o "hoje" das perguntas relativas ("último mês"), sempre tirado
 * dos dados, nunca do relógio. Mesma regra do scripts/preparar_dados.py
 * (data_ancora), testada com os mesmos casos: fim do último mês com volume de
 * pelo menos 10% da mediana mensal.
 */

export interface VolumeMensal {
  /** Primeiro dia do mês, AAAA-MM-DD. */
  mes: string;
  n: number;
}

export function mediana(valores: readonly number[]): number {
  if (valores.length === 0) throw new Error('mediana de lista vazia');
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? (ordenados[meio] ?? 0) : ((ordenados[meio - 1] ?? 0) + (ordenados[meio] ?? 0)) / 2;
}

export function ultimoDiaDoMes(dia: string): string {
  const [ano, mes] = dia.split('-').map(Number);
  if (!ano || !mes) throw new Error(`data inválida: ${dia}`);
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

function limiar(volume: readonly VolumeMensal[], fracao: number): number {
  return fracao * mediana(volume.map((v) => v.n));
}

export function calcularAncora(volume: readonly VolumeMensal[], fracao = 0.1): string {
  if (volume.length === 0) throw new Error('volume mensal vazio');
  const minimo = limiar(volume, fracao);
  const ultimo = [...volume].sort((a, b) => b.mes.localeCompare(a.mes)).find((v) => v.n >= minimo);
  if (!ultimo) throw new Error('nenhum mês atinge o volume mínimo');
  return ultimoDiaDoMes(ultimo.mes);
}

/** Meses com poucos registros (base incompleta): os gráficos marcam esses meses. */
export function mesesComPoucosDados(volume: readonly VolumeMensal[], fracao = 0.1): string[] {
  if (volume.length === 0) return [];
  const minimo = limiar(volume, fracao);
  return volume.filter((v) => v.n < minimo).map((v) => v.mes);
}
