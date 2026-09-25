/**
 * Motor de verdade: WebLLM (MLC) num Web Worker, com WebGPU.
 *
 * - `import('@mlc-ai/web-llm')` é DINÂMICO: quem não ativa a IA não baixa nem 1 byte do WebLLM.
 * - O modelo é escolhido a partir da `prebuiltAppConfig` da versão instalada (src/ai/modelos.ts).
 * - `model_lib` (o .wasm) vem sempre do próprio site; pesos do Hugging Face (modo "demo") ou do
 *   próprio site (modo "local", `npm run baixar-modelo`). Ver docs/DECISOES.md (D28-D31).
 * - temperature 0 + JSON Schema (XGrammar): a saída é sempre um JSON no formato pedido.
 *
 * Não testável na nuvem (sem GPU): validar no PC (roteiro no CLAUDE.md).
 */
import { detectarGpu } from './gpu';
import { escolherModelo, lerFonte, registroParaApp, type CapacidadesGpu, type RegistroModelo } from './modelos';
import type { MotorLLM, PedidoCompletar, ProgressoCarga, RespostaCompletar } from './tipos';

export interface CargaWebLLM {
  motor: MotorLLM;
  modelo: RegistroModelo;
  gpu: CapacidadesGpu;
  motivos: string[];
  /** Segundos do clique até o modelo pronto (inclui download na 1ª vez; cache depois). */
  segundosCarga: number;
  /** Segundos da 1ª geração curta (aquecimento: compila os shaders). */
  segundosAquecimento: number;
  fonte: 'demo' | 'local';
}

export class SemWebGpu extends Error {}

export async function carregarWebLLM(aoProgresso: (p: ProgressoCarga) => void, opcoes: { forcarModelo?: string } = {}): Promise<CargaWebLLM> {
  const t0 = performance.now();
  const gpu = await detectarGpu();
  const webllm = await import('@mlc-ai/web-llm');
  const escolha = escolherModelo(webllm.prebuiltAppConfig.model_list, gpu, opcoes.forcarModelo ?? import.meta.env.VITE_MODELO);
  if (!escolha.ok) throw new SemWebGpu(escolha.motivo);

  const fonte = lerFonte(import.meta.env.VITE_MODEL_SOURCE);
  const registro = registroParaApp(escolha.modelo, fonte, location.origin);
  const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  const engine = await webllm.CreateWebWorkerMLCEngine(worker, registro.model_id, {
    appConfig: { model_list: [registro], cacheBackend: 'cache' },
    initProgressCallback: (r) => aoProgresso({ fracao: r.progress, texto: r.text, segundos: r.timeElapsed }),
  });
  const segundosCarga = (performance.now() - t0) / 1000;

  const pensa = registro.model_id.startsWith('Qwen3');
  const completar = async (pedido: PedidoCompletar): Promise<RespostaCompletar> => {
    const inicio = performance.now();
    const base = {
      messages: pedido.mensagens,
      temperature: 0,
      max_tokens: pedido.maxTokens,
      ...(pedido.schemaJson ? { response_format: { type: 'json_object' as const, schema: pedido.schemaJson } } : {}),
      // Qwen3.x "pensa" antes de responder por padrão; aqui não precisa (e custaria segundos).
      ...(pensa ? { extra_body: { enable_thinking: false } } : {}),
    };
    let texto = '';
    let uso: { prompt_tokens: number; completion_tokens: number; extra?: Record<string, unknown> } | undefined;
    if (pedido.aoParcial) {
      const fluxo = await engine.chat.completions.create({ ...base, stream: true, stream_options: { include_usage: true } });
      for await (const pedaco of fluxo) {
        texto += pedaco.choices[0]?.delta.content ?? '';
        pedido.aoParcial(texto);
        if (pedaco.usage) uso = pedaco.usage;
      }
    } else {
      const r = await engine.chat.completions.create({ ...base, stream: false });
      texto = r.choices[0]?.message.content ?? '';
      uso = r.usage;
    }
    const metricas = Object.fromEntries(Object.entries(uso?.extra ?? {}).filter((e): e is [string, number] => typeof e[1] === 'number'));
    return { texto, ms: performance.now() - inicio, tokensEntrada: uso?.prompt_tokens, tokensSaida: uso?.completion_tokens, metricas };
  };

  // Aquecimento: 1ª geração curta compila os shaders; a 1ª pergunta de verdade não paga esse custo.
  const tAquece = performance.now();
  await completar({ mensagens: [{ role: 'user', content: 'Responda apenas: ok' }], maxTokens: 2 });
  await engine.resetChat();
  const segundosAquecimento = (performance.now() - tAquece) / 1000;

  return {
    motor: { id: registro.model_id, tipo: 'webllm', completar },
    modelo: registro,
    gpu,
    motivos: escolha.motivos,
    segundosCarga,
    segundosAquecimento,
    fonte,
  };
}
