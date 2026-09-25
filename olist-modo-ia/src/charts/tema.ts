/** Identidade visual do Power BI do Harley, também usada no CSS (src/ui/estilos.css). */
export const CORES = {
  fundo: '#0B1120',
  painel: '#131C31',
  borda: '#1E2A45',
  destaque: '#22D3EE',
  roxo: '#8B5CF6',
  texto: '#F1F5F9',
  textoSecundario: '#94A3B8',
  /** Só para negativo ou atraso. */
  alerta: '#F87171',
} as const;

export const GRADIENTE_HORIZONTAL = {
  type: 'linear' as const,
  x: 0,
  y: 0,
  x2: 1,
  y2: 0,
  colorStops: [
    { offset: 0, color: CORES.destaque },
    { offset: 1, color: CORES.roxo },
  ],
};

export const GRADIENTE_VERTICAL = { ...GRADIENTE_HORIZONTAL, x2: 0, y: 1 };

export const TEMA_ECHARTS = {
  color: [CORES.destaque, CORES.roxo, '#38BDF8', '#A78BFA', '#2DD4BF'],
  backgroundColor: 'transparent',
  textStyle: { color: CORES.textoSecundario, fontFamily: 'inherit' },
  categoryAxis: {
    axisLine: { lineStyle: { color: CORES.borda } },
    axisTick: { show: false },
    axisLabel: { color: CORES.textoSecundario },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisLabel: { color: CORES.textoSecundario },
    splitLine: { lineStyle: { color: CORES.borda, type: 'dashed' } },
  },
  tooltip: {
    backgroundColor: CORES.fundo,
    borderColor: CORES.borda,
    textStyle: { color: CORES.texto },
  },
};

export const NOME_TEMA = 'olist-escuro';
