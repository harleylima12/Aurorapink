/**
 * Guardas de código: regras do projeto conferidas em todo teste.
 * - P6: nada de innerHTML e parentes (a saída da IA e os dados são texto não confiável);
 * - TypeScript sem `any`;
 * - P3: nenhuma URL de CDN no código do app;
 * - a CSP do vercel.json é a mesma do csp.config.ts.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { cabecalhosSeguranca, cspProducao } from '../../csp.config.ts';
import { RAIZ } from './ajuda/duckdbNode';

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
  });
}

const fontes = arquivos(path.join(RAIZ, 'src')).map((arquivo) => ({
  arquivo: path.relative(RAIZ, arquivo),
  // Comentários fora: a regra vale para o código.
  codigo: readFileSync(arquivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''),
}));

describe('guardas', () => {
  it('existem arquivos para conferir', () => {
    expect(fontes.length).toBeGreaterThan(5);
  });

  it('P6: sem innerHTML, outerHTML, insertAdjacentHTML, dangerouslySetInnerHTML, document.write, eval', () => {
    const proibido = /\b(innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|eval\s*\(|new Function\s*\()/;
    const violacoes = fontes.filter((f) => proibido.test(f.codigo)).map((f) => f.arquivo);
    expect(violacoes).toEqual([]);
  });

  it('TypeScript sem any', () => {
    const qualquer = /(:\s*any\b|\bas\s+any\b|<any>|any\[\])/;
    const violacoes = fontes.filter((f) => qualquer.test(f.codigo)).map((f) => f.arquivo);
    expect(violacoes).toEqual([]);
  });

  it('P3: nenhuma CDN no código', () => {
    const cdn = /(jsdelivr|unpkg|cdnjs|googleapis|gstatic|getJsDelivrBundles|extensions\.duckdb\.org)/;
    const violacoes = fontes.filter((f) => cdn.test(f.codigo)).map((f) => f.arquivo);
    expect(violacoes).toEqual([]);
  });

  it('Zod sempre pelo src/zod.ts (jitless: sem violação de CSP)', () => {
    const diretos = fontes.filter((f) => f.arquivo !== path.join('src', 'zod.ts') && /from 'zod'/.test(f.codigo)).map((f) => f.arquivo);
    expect(diretos).toEqual([]);
  });

  it('vercel.json usa exatamente os cabeçalhos do csp.config.ts', () => {
    const vercel = JSON.parse(readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8')) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    const todos = vercel.headers.find((h) => h.source === '/(.*)');
    const noVercel = Object.fromEntries((todos?.headers ?? []).map((h) => [h.key, h.value]));
    expect(noVercel).toEqual(cabecalhosSeguranca(cspProducao));
  });

  it('a CSP de produção não libera script inline nem domínio externo', () => {
    const scriptSrc = cspProducao.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc.trim()).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expect(cspProducao).not.toContain("'unsafe-eval'");
    expect(cspProducao).toMatch(/connect-src 'self';/);
    expect(cspProducao).not.toMatch(/https?:/);
  });
});
