/** Formatação em pt-BR, sempre com Intl.NumberFormat (R$ 13,49 mi; 6,8%). */
import type { Formato } from '../semantic/schema';

const VAZIO = '—';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompacto = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 2,
});
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const inteiroCompacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const dec1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface OpcoesFormato {
  /** "R$ 13,49 mi" em vez de "R$ 13.494.400,74" (a partir de 1 milhão ou sempre, nos eixos). */
  compacto?: boolean;
}

export function formatar(valor: number | null | undefined, formato: Formato, opcoes: OpcoesFormato = {}): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return VAZIO;
  if (opcoes.compacto && valor === 0 && (formato === 'brl' || formato === 'int')) return formato === 'brl' ? 'R$ 0' : '0';
  switch (formato) {
    case 'brl':
      return opcoes.compacto && Math.abs(valor) >= 10_000 ? brlCompacto.format(valor) : brl.format(valor);
    case 'int':
      return opcoes.compacto && Math.abs(valor) >= 10_000 ? inteiroCompacto.format(valor) : inteiro.format(valor);
    case 'dec1':
      return dec1.format(valor);
    case 'dec2':
      return dec2.format(valor);
    case 'pct':
      return pct.format(valor);
    case 'dias':
      return `${dec1.format(valor)} dias`;
  }
}

/** Rótulo de período para eixos e tooltips: "nov/2017", "2017", "T4/2017", "24/11/2017". */
export function rotuloPeriodo(iso: string, grao: 'dia' | 'semana' | 'mes' | 'trimestre' | 'ano'): string {
  const [ano, mes, dia] = iso.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  switch (grao) {
    case 'ano':
      return ano ?? iso;
    case 'trimestre':
      return `T${Math.floor((Number(mes) - 1) / 3) + 1}/${ano}`;
    case 'mes':
      return `${meses[Number(mes) - 1] ?? mes}/${ano}`;
    case 'semana':
    case 'dia':
      return `${dia}/${mes}/${ano}`;
  }
}
