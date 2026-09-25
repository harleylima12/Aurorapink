import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

import { cabecalhosSeguranca, cspDesenvolvimentoPara, cspMetaPara, cspProducaoPara, type FontePesos } from './csp.config.ts';

/** Injeta a CSP também como <meta> no HTML do build (segunda camada). */
function cspNoHtml(cspMeta: string): Plugin {
  return {
      name: 'csp-no-html',
      apply: 'build',
      transformIndexHtml() {
        return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: cspMeta }, injectTo: 'head-prepend' }];
      },
  };
}

export default defineConfig(({ mode }) => {
  // Mesma regra de src/ai/modelos.ts (lerFonte): só "local" é local; o resto é demo.
  const fonte: FontePesos = loadEnv(mode, process.cwd(), 'VITE_').VITE_MODEL_SOURCE === 'local' ? 'local' : 'demo';
  return {
    plugins: [react(), cspNoHtml(cspMetaPara(fonte))],
    server: { headers: cabecalhosSeguranca(cspDesenvolvimentoPara(fonte)) },
    preview: { headers: cabecalhosSeguranca(cspProducaoPara(fonte)) },
    build: {
      target: 'es2022',
      // Os .wasm do DuckDB (≈34 MB cada, antes da compressão) são copiados como arquivos, nunca embutidos.
      assetsInlineLimit: 0,
    },
    worker: { format: 'es' },
  };
});
