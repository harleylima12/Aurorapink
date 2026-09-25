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
 * - connect-src 'self': dados, WASM e extensão do DuckDB vêm do próprio site.
 *   Os domínios dos pesos do modelo (modo demo) entram só na Fase 4/6, medidos.
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

function montar(diretivas: Record<string, string[]>): string {
  return Object.entries(diretivas)
    .map(([nome, valores]) => `${nome} ${valores.join(' ')}`)
    .join('; ');
}

/** Política de produção (build + preview + Vercel). */
export const cspProducao = montar(base);

/** No <meta>, frame-ancestors é ignorado (e gera aviso no console), então sai. */
export const cspMeta = montar(Object.fromEntries(Object.entries(base).filter(([nome]) => nome !== 'frame-ancestors')));

/**
 * Só no `npm run dev`: o React Refresh injeta um <script> inline e o HMR usa
 * WebSocket. Nunca vai para produção.
 */
export const cspDesenvolvimento = montar({
  ...base,
  'script-src': [...(base['script-src'] ?? []), "'unsafe-inline'"],
  'connect-src': [...(base['connect-src'] ?? []), 'ws://localhost:*', 'ws://127.0.0.1:*'],
});

export function cabecalhosSeguranca(csp: string): Record<string, string> {
  return {
    'Content-Security-Policy': csp,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}
