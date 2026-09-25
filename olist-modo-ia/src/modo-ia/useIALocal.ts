/**
 * Estado da IA local (Camada 1) na interface.
 *
 * verificando -> sem-webgpu (só Modo Rápido) | disponivel -> baixando (barra) -> pronta | erro
 * Nada do WebLLM é baixado antes do clique em "Ativar IA local" (import dinâmico).
 * Nos testes e2e, `?motor=falso` troca o modelo pelo motor falso, mas SÓ num build feito com
 * VITE_PERMITIR_MOTOR_FALSO=1 (no build normal esse código nem entra no pacote).
 */
import { useCallback, useEffect, useState } from 'react';

import { detectarGpu } from '../ai/gpu';
import type { FonteModelo } from '../ai/modelos';
import type { ModoFalso } from '../ai/motorFalso';
import type { MotorLLM, ProgressoCarga } from '../ai/tipos';
import { iaFoiAtivada, lembrarIaAtivada } from './armazenamento';

export interface InfoModelo {
  id: string;
  fonte: FonteModelo | 'falso';
  motivos: string[];
  segundosCarga: number;
  segundosAquecimento: number;
  vramMB?: number;
  gpu?: string;
}

export type EstadoIA =
  | { fase: 'verificando' }
  | { fase: 'sem-webgpu'; motivo: string }
  | { fase: 'disponivel'; gpu: string }
  | { fase: 'baixando'; progresso: ProgressoCarga }
  | { fase: 'pronta'; motor: MotorLLM; info: InfoModelo }
  | { fase: 'erro'; motivo: string };

export interface ControleIA {
  estado: EstadoIA;
  ativar(): void;
  motor: MotorLLM | null;
}

function pedidoMotorFalso(): { modo: ModoFalso } | null {
  if (import.meta.env.VITE_PERMITIR_MOTOR_FALSO !== '1') return null;
  const p = new URLSearchParams(location.search);
  if (p.get('motor') !== 'falso') return null;
  return { modo: (p.get('modo') as ModoFalso | null) ?? 'normal' };
}

export function useIALocal(aberto: boolean): ControleIA {
  const [estado, setEstado] = useState<EstadoIA>({ fase: 'verificando' });

  useEffect(() => {
    if (!aberto || estado.fase !== 'verificando') return;
    let vivo = true;
    if (pedidoMotorFalso()) {
      setEstado({ fase: 'disponivel', gpu: 'motor falso (teste)' });
      return;
    }
    void detectarGpu().then((gpu) => {
      if (!vivo) return;
      if (!gpu.webgpu) setEstado({ fase: 'sem-webgpu', motivo: 'Este navegador não tem WebGPU: só o Modo Rápido funciona.' });
      else setEstado({ fase: 'disponivel', gpu: [gpu.fabricante, gpu.arquitetura].filter(Boolean).join(' ') || 'GPU com WebGPU' });
    });
    return () => {
      vivo = false;
    };
  }, [aberto, estado.fase]);

  const ativar = useCallback(() => {
    if (estado.fase !== 'disponivel' && estado.fase !== 'erro') return;
    setEstado({ fase: 'baixando', progresso: { fracao: 0, texto: 'Preparando…', segundos: 0 } });
    const aoProgresso = (progresso: ProgressoCarga) => setEstado({ fase: 'baixando', progresso });
    const falso = pedidoMotorFalso();
    // A 1ª condição é constante no build: sem VITE_PERMITIR_MOTOR_FALSO=1, o motor falso nem entra no pacote.
    const carga =
      import.meta.env.VITE_PERMITIR_MOTOR_FALSO === '1' && falso
      ? import('../ai/motorFalso').then(async ({ carregarMotorFalso }) => {
          const t0 = performance.now();
          const motor = await carregarMotorFalso(aoProgresso, { modo: falso.modo, atrasoMs: 150 });
          const info: InfoModelo = { id: motor.id, fonte: 'falso', motivos: ['motor falso dos testes e2e (sem modelo)'], segundosCarga: (performance.now() - t0) / 1000, segundosAquecimento: 0 };
          return { motor, info };
        })
      : import('../ai/motorWebLLM').then(async ({ carregarWebLLM }) => {
          const c = await carregarWebLLM(aoProgresso);
          const info: InfoModelo = {
            id: c.modelo.model_id,
            fonte: c.fonte,
            motivos: c.motivos,
            segundosCarga: c.segundosCarga,
            segundosAquecimento: c.segundosAquecimento,
            vramMB: c.modelo.vram_required_MB,
            gpu: [c.gpu.fabricante, c.gpu.arquitetura, c.gpu.descricao].filter(Boolean).join(' '),
          };
          return { motor: c.motor, info };
        });
    carga
      .then(({ motor, info }) => {
        lembrarIaAtivada(true);
        setEstado({ fase: 'pronta', motor, info });
      })
      .catch((e: unknown) => setEstado({ fase: 'erro', motivo: e instanceof Error ? e.message : String(e) }));
  }, [estado.fase]);

  // Quem já ativou antes: reativa sozinho (o modelo está no cache do navegador).
  useEffect(() => {
    if (aberto && estado.fase === 'disponivel' && iaFoiAtivada()) ativar();
  }, [aberto, estado.fase, ativar]);

  return { estado, ativar, motor: estado.fase === 'pronta' ? estado.motor : null };
}
