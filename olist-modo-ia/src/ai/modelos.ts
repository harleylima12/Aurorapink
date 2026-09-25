/**
 * Escolha do modelo (função pura) a partir da `prebuiltAppConfig.model_list` da versão
 * INSTALADA do WebLLM (0.2.85) e das capacidades da GPU.
 *
 * Ordem de preferência (docs/FASE0_PLANO.md §3): Qwen2.5-1.5B -> Qwen3.5-0.8B -> Llama-3.2-1B.
 * q4f16 se o adaptador tem `shader-f16`; senão q4f32. Máquina fraca -> o menor.
 * Os limites abaixo são heurísticos e precisam ser CALIBRADOS NO PC (roteiro no CLAUDE.md).
 */

export interface RegistroModelo {
  model: string;
  model_id: string;
  model_lib: string;
  vram_required_MB?: number;
  low_resource_required?: boolean;
  required_features?: string[];
  overrides?: object;
}

export interface CapacidadesGpu {
  webgpu: boolean;
  shaderF16: boolean;
  /** adapter.limits.maxBufferSize em MB (o WebGPU não informa a VRAM total). */
  maxBufferMB?: number;
  /** navigator.deviceMemory (GB de RAM, aproximado; só no Chrome). */
  memoriaGB?: number;
  fabricante?: string;
  arquitetura?: string;
  descricao?: string;
}

export const PREFERENCIA = ['Qwen2.5-1.5B-Instruct', 'Qwen3.5-0.8B', 'Llama-3.2-1B-Instruct'] as const;

/** Heurística de "máquina fraca": abaixo disso, vai direto para o menor modelo. A calibrar no PC. */
export const LIMITE_FRACA = { maxBufferMB: 1024, memoriaGB: 8 } as const;

export type Escolha =
  | { ok: true; modelo: RegistroModelo; motivos: string[] }
  | { ok: false; motivo: string };

export function idDoCandidato(base: string, f16: boolean): string {
  return `${base}-${f16 ? 'q4f16_1' : 'q4f32_1'}-MLC`;
}

export function escolherModelo(lista: readonly RegistroModelo[], gpu: CapacidadesGpu, forcar?: string): Escolha {
  if (!gpu.webgpu) return { ok: false, motivo: 'Este navegador não tem WebGPU: só o Modo Rápido funciona.' };
  const motivos: string[] = [];
  if (forcar) {
    const m = lista.find((x) => x.model_id === forcar);
    if (!m) return { ok: false, motivo: `Modelo ${forcar} não existe no WebLLM instalado.` };
    if (m.model_id.includes('f16') && !gpu.shaderF16) return { ok: false, motivo: `${forcar} precisa de shader-f16, que esta GPU não tem.` };
    return { ok: true, modelo: m, motivos: ['modelo forçado pela configuração'] };
  }
  motivos.push(gpu.shaderF16 ? 'GPU com shader-f16: variante q4f16' : 'GPU sem shader-f16: variante q4f32');
  const fraca =
    (gpu.maxBufferMB !== undefined && gpu.maxBufferMB < LIMITE_FRACA.maxBufferMB) ||
    (gpu.memoriaGB !== undefined && gpu.memoriaGB < LIMITE_FRACA.memoriaGB);
  const candidatos = PREFERENCIA.map((base) => lista.find((m) => m.model_id === idDoCandidato(base, gpu.shaderF16))).filter(
    (m): m is RegistroModelo => m !== undefined,
  );
  if (!candidatos.length) return { ok: false, motivo: 'Nenhum dos modelos candidatos existe nesta versão do WebLLM.' };
  if (fraca) {
    const menor = [...candidatos].sort((a, b) => (a.vram_required_MB ?? Infinity) - (b.vram_required_MB ?? Infinity))[0];
    if (!menor) return { ok: false, motivo: 'sem candidato' };
    motivos.push(`máquina com pouca memória (buffer ${gpu.maxBufferMB ?? '?'} MB, RAM ${gpu.memoriaGB ?? '?'} GB): o menor modelo`);
    return { ok: true, modelo: menor, motivos };
  }
  const [primeiro] = candidatos;
  if (!primeiro) return { ok: false, motivo: 'sem candidato' };
  motivos.push('primeiro da ordem de preferência');
  return { ok: true, modelo: primeiro, motivos };
}

export type FonteModelo = 'demo' | 'local';

export function lerFonte(valor: string | undefined): FonteModelo {
  return valor === 'local' ? 'local' : 'demo';
}

/**
 * Registro que o app entrega ao WebLLM.
 * - model_lib (o .wasm do modelo) SEMPRE vem do próprio site (P3; ajuste 7 da Fase 0).
 * - pesos: modo "demo" = Hugging Face (único domínio externo, explícito); modo "local" = /models/<id>/.
 * O WebLLM exige URL absoluta e acrescenta "resolve/main/" (conferido em lib/index.js, cleanModelUrl).
 */
export function registroParaApp(modelo: RegistroModelo, fonte: FonteModelo, origem: string): RegistroModelo {
  const arquivoLib = modelo.model_lib.split('/').pop() ?? modelo.model_lib;
  return {
    ...modelo,
    model_lib: `${origem}/models/libs/${arquivoLib}`,
    model: fonte === 'local' ? `${origem}/models/${modelo.model_id}/` : modelo.model,
  };
}
