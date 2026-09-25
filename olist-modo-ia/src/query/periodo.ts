/**
 * Períodos: filtro de ano do dashboard e período de comparação
 * (`time.compare` do QuerySpec). Funções puras sobre datas AAAA-MM-DD, em UTC.
 */
import type { QuerySpec } from './spec';

const DIA_MS = 86_400_000;

function paraData(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) throw new Error(`data inválida: ${iso}`);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function somarDias(iso: string, dias: number): string {
  return paraIso(new Date(paraData(iso).getTime() + dias * DIA_MS));
}

/** Mesmo dia no ano anterior; 29/02 vira 28/02. */
export function anoAnterior(iso: string): string {
  const d = paraData(iso);
  const alvo = new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d.getUTCDate(), ultimoDia));
  return paraIso(alvo);
}

function ehMesesInteiros(from: string, to: string): boolean {
  return from.endsWith('-01') && somarDias(to, 1).endsWith('-01');
}

function mesesEntre(from: string, to: string): number {
  const a = paraData(from);
  const b = paraData(to);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() + 1;
}

export function periodoDoAno(ano: number): { from: string; to: string } {
  return { from: `${ano}-01-01`, to: `${ano}-12-31` };
}

/**
 * Spec do período de comparação, ou null se não houver comparação.
 * - periodo_anterior: mesmo número de dias, logo antes do início.
 * - mesmo_periodo_ano_anterior: as mesmas datas, um ano antes.
 */
export function specDeComparacao(spec: QuerySpec): QuerySpec | null {
  const tempo = spec.time;
  if (!tempo?.compare || tempo.compare === 'nenhum') return null;
  if (!tempo.from || !tempo.to) throw new Error('comparação exige período com início e fim');
  let from: string;
  let to: string;
  if (tempo.compare === 'mesmo_periodo_ano_anterior') {
    from = anoAnterior(tempo.from);
    to = anoAnterior(tempo.to);
  } else if (ehMesesInteiros(tempo.from, tempo.to)) {
    // Meses inteiros (mês, trimestre, ano): o período anterior também é de meses inteiros (dez -> nov).
    const meses = mesesEntre(tempo.from, tempo.to);
    const inicio = paraData(tempo.from);
    from = paraIso(new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() - meses, 1)));
    to = somarDias(tempo.from, -1);
  } else {
    const dias = Math.round((paraData(tempo.to).getTime() - paraData(tempo.from).getTime()) / DIA_MS);
    to = somarDias(tempo.from, -1);
    from = somarDias(to, -dias);
  }
  return { ...spec, time: { ...tempo, from, to, compare: 'nenhum' } };
}
