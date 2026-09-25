import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import { useEffect, useRef } from 'react';

import { echarts } from '../charts/echarts';
import { NOME_TEMA } from '../charts/tema';

interface Props {
  opcoes: EChartsCoreOption;
  /** Descrição para leitor de tela. */
  rotulo: string;
  altura: number;
  aoRenderizar?: () => void;
  /** Recebe a instância do ECharts (para exportar PNG). */
  aoIniciar?: (instancia: EChartsType | null) => void;
}

export function Grafico({ opcoes, rotulo, altura, aoRenderizar, aoIniciar }: Props) {
  const elemento = useRef<HTMLDivElement>(null);
  const grafico = useRef<EChartsType | null>(null);
  // Guardado em ref: um callback novo a cada render não deve redesenhar o gráfico.
  const callback = useRef(aoRenderizar);
  useEffect(() => {
    callback.current = aoRenderizar;
  }, [aoRenderizar]);

  useEffect(() => {
    const el = elemento.current;
    if (!el) return;
    const instancia = echarts.init(el, NOME_TEMA, { renderer: 'canvas' });
    grafico.current = instancia;
    aoIniciar?.(instancia);
    const observador = new ResizeObserver(() => instancia.resize());
    observador.observe(el);
    return () => {
      observador.disconnect();
      instancia.dispose();
      grafico.current = null;
      aoIniciar?.(null);
    };
    // A instância nasce uma vez; aoIniciar é só um aviso.
  }, []);

  useEffect(() => {
    grafico.current?.setOption(opcoes, { notMerge: true });
    callback.current?.();
  }, [opcoes]);

  return <div ref={elemento} className="grafico" role="img" aria-label={rotulo} style={{ height: altura }} />;
}
