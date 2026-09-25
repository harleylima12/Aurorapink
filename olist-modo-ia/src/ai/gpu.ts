/** Detecta as capacidades da GPU pelo WebGPU (sem baixar nada). */
import type { CapacidadesGpu } from './modelos';

interface AdaptadorGpu {
  features: { has(nome: string): boolean };
  limits: { maxBufferSize: number };
  info?: { vendor?: string; architecture?: string; description?: string };
}

interface NavegadorComGpu {
  gpu?: { requestAdapter(opcoes?: { powerPreference?: string }): Promise<AdaptadorGpu | null> };
  deviceMemory?: number;
}

export async function detectarGpu(): Promise<CapacidadesGpu> {
  const nav = navigator as Navigator & NavegadorComGpu;
  const memoriaGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined;
  if (!nav.gpu) return { webgpu: false, shaderF16: false, memoriaGB };
  try {
    const adaptador = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adaptador) return { webgpu: false, shaderF16: false, memoriaGB };
    return {
      webgpu: true,
      shaderF16: adaptador.features.has('shader-f16'),
      maxBufferMB: Math.round(adaptador.limits.maxBufferSize / 2 ** 20),
      memoriaGB,
      fabricante: adaptador.info?.vendor,
      arquitetura: adaptador.info?.architecture,
      descricao: adaptador.info?.description,
    };
  } catch {
    return { webgpu: false, shaderF16: false, memoriaGB };
  }
}
