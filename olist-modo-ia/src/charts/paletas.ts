/**
 * Paletas por tema (Fase 5C). Cor não é escolhida no olho: cada paleta passa por checagens calculadas
 * (tests/unit/paletas.test.ts), as mesmas do método de dataviz usado no projeto (D64):
 *
 * - contraste WCAG contra o fundo do painel: ≥ 3:1 para marcas; o destaque, que também aparece em texto, ≥ 4,5:1;
 * - daltonismo: distância OKLab ×100 entre cores VIZINHAS na paleta, simulando protanopia e deuteranopia
 *   (Machado, Oliveira e Fernandes, 2009, severidade 1): ≥ 8. Visão normal: ≥ 15;
 * - vermelho é reservado para negativo/alerta: o destaque de cada tema fica a ≥ 15 do vermelho de alerta.
 *
 * A ordem das cores categóricas de cada tema foi achada testando todas as permutações e ficando só com as que
 * passam (script em docs/DECISOES.md, D64). O primeiro slot é a família de cor do tema.
 */
import type { Tema } from '../universal/temas/definicoes';
import { CORES } from './tema';

/** Oito famílias de cor para o fundo escuro (passos validados na banda de luminosidade do modo escuro). */
export const FAMILIAS = {
  azul: '#3987e5',
  laranja: '#d95926',
  agua: '#199e70',
  ambar: '#c98500',
  magenta: '#d55181',
  verde: '#008300',
  violeta: '#9085e9',
} as const;
type Familia = keyof typeof FAMILIAS;

export interface PaletaTema {
  /** Cor de identidade: barras de uma série só, detalhes da interface. */
  destaque: string;
  /** Cores categóricas (várias séries), nesta ordem, nunca recicladas. */
  categorica: string[];
  /** Financeiro: entradas e saídas (par validado lado a lado). */
  entrada?: string;
  saida?: string;
}

const ordem = (...f: Familia[]) => f.map((x) => FAMILIAS[x]);

export const PALETAS: Readonly<Record<Tema, PaletaTema>> = {
  vendas: { destaque: '#2dd4bf', categorica: ordem('agua', 'azul', 'laranja', 'violeta', 'ambar', 'magenta', 'verde') },
  financeiro: {
    destaque: '#34d399',
    categorica: ordem('agua', 'ambar', 'azul', 'laranja', 'violeta', 'magenta', 'verde'),
    entrada: FAMILIAS.agua,
    saida: FAMILIAS.ambar,
  },
  rh: { destaque: '#a78bfa', categorica: ordem('violeta', 'laranja', 'agua', 'azul', 'ambar', 'magenta', 'verde') },
  estoque: { destaque: '#fbbf24', categorica: ordem('ambar', 'magenta', 'verde', 'azul', 'laranja', 'violeta', 'agua') },
  marketing: { destaque: '#e879f9', categorica: ordem('magenta', 'ambar', 'azul', 'laranja', 'agua', 'violeta', 'verde') },
  atendimento: { destaque: '#60a5fa', categorica: ordem('azul', 'laranja', 'agua', 'violeta', 'ambar', 'magenta', 'verde') },
  educacao: { destaque: '#a3e635', categorica: ordem('verde', 'magenta', 'ambar', 'azul', 'laranja', 'violeta', 'agua') },
  saude: { destaque: '#4fb3c8', categorica: ordem('agua', 'azul', 'laranja', 'violeta', 'ambar', 'magenta', 'verde') },
  generico: { destaque: '#a5b4cc', categorica: ordem('azul', 'laranja', 'agua', 'violeta', 'ambar', 'magenta', 'verde') },
};

/** A demo da Olist mantém a identidade do Power BI do Harley. */
export const PALETA_OLIST: PaletaTema = { destaque: CORES.destaque, categorica: [CORES.destaque, CORES.roxo, '#38BDF8', '#A78BFA', '#2DD4BF'] };

// --- Matemática de cor (funções puras) -----------------------------------------------------------------------
type Rgb = [number, number, number];
const hexRgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
const paraLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const deLinear = (c: number) => {
  const x = Math.max(0, Math.min(1, c));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};
const linear = (h: string): Rgb => hexRgb(h).map(paraLinear) as Rgb;

export function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = linear(h);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [alto, baixo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (alto + 0.05) / (baixo + 0.05);
}

function oklabDeLinear([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

export const oklab = (h: string): Rgb => oklabDeLinear(linear(h));

function hexDeOklab([L, a, b]: Rgb): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return `#${rgb.map((c) => Math.round(deLinear(c) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const MACHADO: Record<'protan' | 'deutan', number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};

/** Distância OKLab ×100 entre duas cores; com `tipo`, simulando o daltonismo antes de medir. */
export function distancia(a: string, b: string, tipo?: 'protan' | 'deutan'): number {
  const simular = (h: string): Rgb => {
    const c = linear(h);
    if (!tipo) return c;
    return MACHADO[tipo].map((linha) => Math.max(0, Math.min(1, linha[0]! * c[0] + linha[1]! * c[1] + linha[2]! * c[2]))) as Rgb;
  };
  const [p, q] = [oklabDeLinear(simular(a)), oklabDeLinear(simular(b))];
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * Rampa de UMA cor para magnitude (mapa de calor): do quase-fundo até o destaque, interpolada em OKLab.
 * No escuro, mais valor = mais claro.
 */
export function rampaSequencial(destaque: string, passos = 5): string[] {
  const [L, a, b] = oklab(destaque);
  const inicio: Rgb = [0.3, a * 0.25, b * 0.25];
  return Array.from({ length: passos }, (_, i) => {
    const t = i / (passos - 1);
    return hexDeOklab([inicio[0] + (L - inicio[0]) * t, inicio[1] + (a - inicio[1]) * t, inicio[2] + (b - inicio[2]) * t]);
  });
}

/**
 * Rampa ORDINAL (etapas de um funil): mesmo matiz, luminosidade caindo em passos iguais (ΔL ≥ 0,06), e o passo
 * mais escuro ainda com ≥ 2:1 contra o painel.
 */
export function rampaOrdinal(destaque: string, n: number): string[] {
  const [L, a, b] = oklab(destaque);
  const piso = 0.52;
  const passo = n > 1 ? Math.max(0.06, (L - piso) / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => hexDeOklab([Math.max(piso, L - passo * i), a, b]));
}

export const paletaDoTema = (tema: Tema | null | undefined): PaletaTema => (tema ? PALETAS[tema] : PALETA_OLIST);
