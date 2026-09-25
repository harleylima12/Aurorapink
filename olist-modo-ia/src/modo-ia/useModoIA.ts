import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MotorLLM } from '../ai/tipos';
import type { Motor } from '../data/duckdb';
import type { QuerySpec } from '../query/spec';
import { criarRoteador, type Valores } from '../router/layer0';
import { consultaValoresDistintos } from '../router/valores';
import { semanticaOlist } from '../semantic';
import { insightsAutomaticos } from './insightsAutomaticos';
import { registrarFalhaNarrador } from './armazenamento';
import { narrarComMotor, responder, responderSpec, type ContextoResposta, type Resposta } from './responder';

export interface EntradaHistorico {
  resposta: Resposta;
  /** Da tecla Enter até o cartão pronto para desenhar (inclui React). */
  msTela: number;
  /** A IA está reescrevendo o texto do template (o cartão já está na tela). */
  narrando?: boolean;
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

/**
 * Prepara o Modo Rápido (valores reais da base -> roteador) só quando o painel abre.
 * Com a IA local pronta (`llm`), perguntas que a Camada 0 não resolve vão para o planejador, e o
 * texto do template é reescrito pela IA depois (se passar no validador).
 */
export function useModoIA(motor: Motor, ancora: string, mesesParciais: ReadonlySet<string>, ativo: boolean, llm: MotorLLM | null = null): EstadoModoIA {
  const [base, setContexto] = useState<ContextoResposta | null>(null);
  const [valores, setValores] = useState<Valores | null>(null);
  const contexto = useMemo<ContextoResposta | null>(() => (base && llm && valores ? { ...base, ia: { motor: llm, valores } } : base), [base, llm, valores]);
  const [erro, setErro] = useState<string | null>(null);
  const [insights, setInsights] = useState<Resposta[]>([]);
  const [historico, setHistorico] = useState<EntradaHistorico[]>([]);
  const [pensando, setPensando] = useState(false);
  const anterior = useRef<QuerySpec | null>(null);

  useEffect(() => {
    if (!ativo || base) return;
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
        if (vivo) {
          setValores(valores);
          setContexto(ctx);
        }
      })
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [ativo, base, motor, ancora, mesesParciais]);

  // Efeito separado: se ficasse no de cima, o setContexto desmontaria o efeito antes dos insights chegarem.
  useEffect(() => {
    if (!base) return;
    let vivo = true;
    insightsAutomaticos(base)
      .then((lista) => vivo && setInsights(lista))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [base]);

  const perguntar = useCallback(
    async (pergunta: string) => {
      if (!contexto || !pergunta.trim()) return;
      const t0 = performance.now();
      setPensando(true);
      try {
        const resposta = await responder(pergunta.trim(), contexto, anterior.current);
        if (resposta.tipo === 'dados') anterior.current = resposta.spec;
        const narrar = contexto.ia && resposta.tipo === 'dados' && resposta.fatos.length > 0;
        setHistorico((h) => [...h, { resposta, msTela: performance.now() - t0, narrando: narrar }]);
        setPensando(false);
        if (narrar && contexto.ia) {
          // O template já está na tela; o texto da IA substitui só se passar no validador.
          const final = await narrarComMotor(resposta, contexto.ia.motor);
          if (final.narracao.rejeitada) {
            registrarFalhaNarrador({
              pergunta: resposta.pergunta,
              modelo: final.narracao.modelo ?? contexto.ia.motor.id,
              versaoPrompt: final.narracao.versaoPrompt,
              erros: final.narracao.rejeitada,
              bruto: final.narracao.bruto,
              em: new Date().toISOString(),
            });
          }
          setHistorico((h) => h.map((e) => (e.resposta.id === resposta.id ? { ...e, resposta: final, narrando: false } : e)));
        }
      } finally {
        setPensando(false);
      }
    },
    [contexto],
  );

  return { pronto: contexto !== null, erro, insights, historico, pensando, perguntar, contexto };
}

export { responderSpec };
