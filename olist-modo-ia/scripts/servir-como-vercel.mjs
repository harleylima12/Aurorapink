// Serve o dist/ com os MESMOS cabeçalhos e rotas do vercel.json (CSP, Service Worker, rewrite para o index.html),
// para testar o build de produção como a Vercel vai servir. Uso: node scripts/servir-como-vercel.mjs [porta]
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');
const vercel = JSON.parse(readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
const porta = Number(process.argv[2] ?? 4190);

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.parquet': 'application/octet-stream',
  '.duckdb': 'application/octet-stream', '.webmanifest': 'application/manifest+json',
};

/** "/(.*)" e "/assets/(.*)" do vercel.json viram regex. */
const casa = (fonte, caminho) => new RegExp(`^${fonte.replace(/\(\.\*\)/g, '(.*)')}$`).test(caminho);

createServer((req, res) => {
  const caminho = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  for (const regra of vercel.headers) if (casa(regra.source, caminho)) for (const h of regra.headers) res.setHeader(h.key, h.value);
  let arquivo = path.join(DIST, caminho);
  if (!arquivo.startsWith(DIST)) return res.writeHead(403).end();
  // Como a Vercel: arquivo que existe primeiro; o resto cai no rewrite (index.html).
  if (!existsSync(arquivo) || statSync(arquivo).isDirectory()) {
    const regra = vercel.rewrites.find((r) => casa(r.source, caminho));
    arquivo = path.join(DIST, regra ? regra.destination : caminho);
  }
  if (!existsSync(arquivo)) return res.writeHead(404).end('404');
  res.setHeader('Content-Type', TIPOS[path.extname(arquivo)] ?? 'application/octet-stream');
  res.setHeader('Content-Length', statSync(arquivo).size);
  createReadStream(arquivo).pipe(res);
}).listen(porta, '127.0.0.1', () => console.log(`dist/ como na Vercel: http://127.0.0.1:${porta}`));
