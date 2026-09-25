import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Exemplo } from '../ai/prompts/exemplos';
import type { MotorLLM } from '../ai/tipos';
import type { Motor } from '../data/duckdb';
import type { QuerySpec } from '../query/spec';
import { criarRoteador, type Valores } from '../router/layer0';
import { consultaValoresDistintos } from '../router/valores';
import { semanticaOlist } from '../semantic';
import type { Semantica } from '../semantic/schema';
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

/** O que muda de uma base para outra (Olist x planilha). Passe um objeto ESTÁVEL (useMemo). */
export interface ExtrasModoIA {
  semantica: Semantica;
  gerarInsights: (ctx: ContextoResposta) => Promise<Resposta[]>;
  exemplosIA?: readonly Exemplo[];
}

export const PADRAO_OLIST: ExtrasModoIA = { semantica: semanticaOlist, gerarInsights: insightsAutomaticos };

export interface EstadoModoIA {
  pronto: boolean;
  erro: string | null;
  insights: Resposta[];
  historico: EntradaHistorico[];
  pensando: boolean;
  perguntar(pergunta: string): Promise<void>;
  contexto: ContextoResposta | null;
}

async function carregarValores(motor: Motor, semantica: Semantica): Promise<Valores> {
  const { sql } = consultaValoresDistintos(semantica);
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
export function useModoIA(
  motor: Motor,
  ancora: string,
  mesesParciais: ReadonlySet<string>,
  ativo: boolean,
  llm: MotorLLM | null = null,
  extras: ExtrasModoIA = PADRAO_OLIST,
): EstadoModoIA {
  const { semantica, gerarInsights, exemplosIA } = extras;
  const [base, setContexto] = useState<ContextoResposta | null>(null);
  const [valores, setValores] = useState<Valores | null>(null);
  const contexto = useMemo<ContextoResposta | null>(() => (base && llm && valores ? { ...base, ia: { motor: llm, valores } } : base), [base, llm, valores]);
  const [erro, setErro] = useState<string | null>(null);
  const [insights, setInsights] = useState<Resposta[]>([]);
  const [historico, setHistorico] = useState<EntradaHistorico[]>([]);
  const [pensando, setPensando] = useState(false);
  const anterior = useRef<QuerySpec | null>(null);

  // Planilha nova = semântica nova: recomeça do zero (histórico e follow-ups não valem mais).
  useEffect(() => {
    setContexto(null);
    setValores(null);
    setHistorico([]);
    setInsights([]);
    anterior.current = null;
  }, [semantica]);

  useEffect(() => {
    if (!ativo || base) return;
    let vivo = true;
    carregarValores(motor, semantica)
      .then(async (valores) => {
        const ctx: ContextoResposta = {
          executor: motor,
          semantica,
          roteador: criarRoteador(semantica, valores, ancora),
          exemplosIA,
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
  }, [ativo, base, motor, ancora, mesesParciais, semantica, exemplosIA]);

  // Efeito separado: se ficasse no de cima, o setContexto desmontaria o efeito antes dos insights chegarem.
  useEffect(() => {
    if (!base) return;
    let vivo = true;
    gerarInsights(base)
      .then((lista) => vivo && setInsights(lista))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [base, gerarInsights]);

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
