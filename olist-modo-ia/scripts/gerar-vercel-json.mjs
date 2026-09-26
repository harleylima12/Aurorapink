// Gera o vercel.json a partir do csp.config.ts (uma fonte só para a CSP). O site público roda no modo "demo"
// (pesos do modelo vindos do Hugging Face), então a CSP é a do demo. Uso: npm run gerar-vercel-json
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cabecalhosSeguranca, cspProducaoPara } from '../csp.config.ts';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cabecalhos = (obj) => Object.entries(obj).map(([key, value]) => ({ key, value }));

const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: 'vite',
  installCommand: 'npm ci',
  // O build baixa as model_lib da IA (conferidas pelo SHA-256 do scripts/modelos.lock.json) antes do Vite.
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  headers: [
    { source: '/(.*)', headers: cabecalhos(cabecalhosSeguranca(cspProducaoPara('demo'))) },
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    {
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    },
    { source: '/manifest.webmanifest', headers: [{ key: 'Content-Type', value: 'application/manifest+json' }] },
  ],
  // Rotas do app (/planilha, /produtos, /logistica, /avaliacao…) caem no index.html ao recarregar.
  // A Vercel serve os arquivos que existem primeiro; só o que não existe vai para o index.html.
  rewrites: [{ source: '/(.*)', destination: '/index.html' }],
};

writeFileSync(path.join(RAIZ, 'vercel.json'), JSON.stringify(config, null, 2) + '\n');
console.log('vercel.json gerado (CSP do modo demo).');
