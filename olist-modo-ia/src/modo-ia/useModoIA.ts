import { useCallback, useEffect, useRef, useState } from 'react';

import type { Motor } from '../data/duckdb';
import type { QuerySpec } from '../query/spec';
import { criarRoteador, type Valores } from '../router/layer0';
import { consultaValoresDistintos } from '../router/valores';
import { semanticaOlist } from '../semantic';
import { insightsAutomaticos } from './insightsAutomaticos';
import { responder, responderSpec, type ContextoResposta, type Resposta } from './responder';

export interface EntradaHistorico {
  resposta: Resposta;
  /** Da tecla Enter até o cartão pronto para desenhar (inclui React). */
  msTela: number;
}

export interface EstadoModoIA {
  pronto: boolean;
  erro: string | null;
  insights: Resposta[];
  historico: EntradaHistorico[];
  pensando: boolean;
  perguntar(pergunta: string): Promise<void>;
  contexto: ContextoResposta | null;
}

async function carregarValores(motor: Motor): Promise<Valores> {
  const { sql } = consultaValoresDistintos(semanticaOlist);
  const { linhas } = await motor.consultar(sql);
  const valores: Record<string, string[]> = {};
  for (const l of linhas) (valores[String(l.dimensao)] ??= []).push(String(l.valor));
  return valores;
}

/** Prepara o Modo Rápido (valores reais da base -> roteador) só quando o painel abre. */
export function useModoIA(motor: Motor, ancora: string, mesesParciais: ReadonlySet<string>, ativo: boolean): EstadoModoIA {
  const [contexto, setContexto] = useState<ContextoResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [insights, setInsights] = useState<Resposta[]>([]);
  const [historico, setHistorico] = useState<EntradaHistorico[]>([]);
  const [pensando, setPensando] = useState(false);
  const anterior = useRef<QuerySpec | null>(null);

  useEffect(() => {
    if (!ativo || contexto) return;
    let vivo = true;
    carregarValores(motor)
      .then(async (valores) => {
        const ctx: ContextoResposta = {
          executor: motor,
          semantica: semanticaOlist,
          roteador: criarRoteador(semanticaOlist, valores, ancora),
          mesesParciais,
          ancora,
        };
        if (vivo) setContexto(ctx);
      })
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [ativo, contexto, motor, ancora, mesesParciais]);

  // Efeito separado: se ficasse no de cima, o setContexto desmontaria o efeito antes dos insights chegarem.
  useEffect(() => {
    if (!contexto) return;
    let vivo = true;
    insightsAutomaticos(contexto)
      .then((lista) => vivo && setInsights(lista))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [contexto]);

  const perguntar = useCallback(
    async (pergunta: string) => {
      if (!contexto || !pergunta.trim()) return;
      const t0 = performance.now();
      setPensando(true);
      try {
        const resposta = await responder(pergunta.trim(), contexto, anterior.current);
        if (resposta.tipo === 'dados') anterior.current = resposta.spec;
        setHistorico((h) => [...h, { resposta, msTela: performance.now() - t0 }]);
      } finally {
        setPensando(false);
      }
    },
    [contexto],
  );

  return { pronto: contexto !== null, erro, insights, historico, pensando, perguntar, contexto };
}

export { responderSpec };
