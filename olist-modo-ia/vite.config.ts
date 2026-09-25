import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { cabecalhosSeguranca, cspDesenvolvimento, cspMeta, cspProducao } from './csp.config.ts';

/** Injeta a CSP também como <meta> no HTML do build (segunda camada). */
function cspNoHtml(): Plugin {
  return {
    name: 'csp-no-html',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: cspMeta }, injectTo: 'head-prepend' }];
    },
  };
}

export default defineConfig({
  plugins: [react(), cspNoHtml()],
  server: { headers: cabecalhosSeguranca(cspDesenvolvimento) },
  preview: { headers: cabecalhosSeguranca(cspProducao) },
  build: {
    target: 'es2022',
    // Os .wasm do DuckDB (≈34 MB cada, antes da compressão) são copiados como arquivos, nunca embutidos.
    assetsInlineLimit: 0,
  },
});
