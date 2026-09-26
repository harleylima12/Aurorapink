/**
 * Política de segurança do app, em um lugar só.
 *
 * A CSP vai no CABEÇALHO HTTP (vale para a página e para os Web Workers, onde
 * rodam o DuckDB e, na Fase 4, a IA). O <meta> no index.html é só uma segunda
 * camada para hospedagens que não aceitam cabeçalhos. O vercel.json repete a
 * mesma política (um teste confere que as duas cópias são iguais).
 *
 * Por que cada exceção existe:
 * - 'wasm-unsafe-eval': o navegador só compila WebAssembly (DuckDB) com ela.
 * - worker-src blob:: reservado para o worker do WebLLM (Fase 4).
 * - style-src 'unsafe-inline': o React e o ECharts aplicam estilos no atributo style.
 * - img-src data: blob:: exportar gráfico como PNG (Fase 3).
 * - connect-src 'self': dados, WASM, extensão do DuckDB e model_lib da IA vêm do próprio site.
 *   No modo "demo" da IA (VITE_MODEL_SOURCE=demo), os pesos vêm do Hugging Face: só esses
 *   domínios entram (DOMINIOS_PESOS_DEMO). No modo "local", nenhum domínio externo.
 */

const base: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'worker-src': ["'self'", 'blob:'],
  'connect-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'style-src': ["'self'", "'unsafe-inline'"],
  'font-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
  'frame-ancestors': ["'none'"],
};

/**
 * Domínios dos pesos no modo demo, MEDIDOS em 26/09 (docs/DECISOES.md D46): arquivos pequenos (config) vêm de
 * huggingface.co; os grandes (pesos, tokenizer) são redirecionados para a CDN deles, que nesta nuvem foi
 * us.aws.cdn.hf.co. O prefixo é de região (pode mudar para quem baixa do Brasil), por isso *.hf.co: todos os
 * subdomínios da CDN do Hugging Face e nada além. Confirmar no PC (DevTools > Rede > Domínio).
 */
export const DOMINIOS_PESOS_DEMO = ['https://huggingface.co', 'https://*.hf.co'] as const;

export type FontePesos = 'demo' | 'local';

function montar(diretivas: Record<string, string[]>): string {
  return Object.entries(diretivas)
    .map(([nome, valores]) => `${nome} ${valores.join(' ')}`)
    .join('; ');
}

function comPesos(fonte: FontePesos): Record<string, string[]> {
  return fonte === 'demo' ? { ...base, 'connect-src': [...(base['connect-src'] ?? []), ...DOMINIOS_PESOS_DEMO] } : base;
}

const semFrameAncestors = (d: Record<string, string[]>) => Object.fromEntries(Object.entries(d).filter(([nome]) => nome !== 'frame-ancestors'));

/** Política de produção ESTRITA (modo local: nenhum domínio externo). É a do vercel.json por enquanto. */
export const cspProducao = montar(base);

/** Política de produção para a fonte de pesos escolhida no build. */
export const cspProducaoPara = (fonte: FontePesos) => montar(comPesos(fonte));

/** No <meta>, frame-ancestors é ignorado (e gera aviso no console), então sai. */
export const cspMeta = montar(semFrameAncestors(base));
export const cspMetaPara = (fonte: FontePesos) => montar(semFrameAncestors(comPesos(fonte)));

/**
 * Só no `npm run dev`: o React Refresh injeta um <script> inline e o HMR usa
 * WebSocket. Nunca vai para produção.
 */
export const cspDesenvolvimentoPara = (fonte: FontePesos) => {
  const d = comPesos(fonte);
  return montar({
    ...d,
    'script-src': [...(d['script-src'] ?? []), "'unsafe-inline'"],
    'connect-src': [...(d['connect-src'] ?? []), 'ws://localhost:*', 'ws://127.0.0.1:*'],
  });
};
export const cspDesenvolvimento = cspDesenvolvimentoPara('local');

export function cabecalhosSeguranca(csp: string): Record<string, string> {
  return {
    'Content-Security-Policy': csp,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}
