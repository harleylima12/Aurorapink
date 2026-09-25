/**
 * scripts/baixar-modelo.mjs contra um Hugging Face FALSO (o de verdade é bloqueado na nuvem).
 * Confere: pasta resolve/main/ (formato que o WebLLM espera), hashes LFS e git, revisão fixada,
 * manifesto com o tamanho real e recusa de arquivo adulterado.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const rodar = promisify(execFile);
const ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
const REPO = `mlc-ai/${ID}`;
const REVISAO = 'a'.repeat(40);
const pesos = Buffer.from('pesos-falsos-'.repeat(1000));
const config = Buffer.from('{"model_type":"llama"}');
let adulterar = false;
let servidor: Server;
let url = '';

const sha256 = (d: Buffer) => createHash('sha256').update(d).digest('hex');
const shaGit = (d: Buffer) => createHash('sha1').update(`blob ${d.length}\0`).update(d).digest('hex');

beforeAll(async () => {
  servidor = createServer((req, res) => {
    const u = req.url ?? '';
    if (u === `/api/models/${REPO}`) return res.end(JSON.stringify({ sha: REVISAO }));
    if (u === `/api/models/${REPO}/tree/${REVISAO}`) {
      return res.end(JSON.stringify([
        { type: 'file', path: 'mlc-chat-config.json', oid: shaGit(config), size: config.length },
        { type: 'file', path: 'params_shard_0.bin', oid: 'x', size: pesos.length, lfs: { oid: sha256(pesos), size: pesos.length } },
        { type: 'file', path: '.gitattributes', oid: 'y', size: 1 },
      ]));
    }
    if (u === `/${REPO}/resolve/${REVISAO}/mlc-chat-config.json`) return res.end(config);
    if (u === `/${REPO}/resolve/${REVISAO}/params_shard_0.bin`) return res.end(adulterar ? Buffer.from('outra coisa') : pesos);
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  const endereco = servidor.address();
  url = `http://127.0.0.1:${typeof endereco === 'object' && endereco ? endereco.port : 0}`;
});

afterAll(() => servidor.close());

function ambiente(pasta: string) {
  return {
    ...process.env,
    URL_HF: url,
    URL_LIBS_MODELO: `http://127.0.0.1:1/nao-usado/`,
    PASTA_MODELOS: pasta,
    LOCK_MODELOS: path.join(pasta, 'lock.json'),
  };
}

const temLibs = existsSync('public/models/libs');

describe.skipIf(!temLibs)('baixar-modelo (servidor falso)', () => {
  it('baixa pesos para <id>/resolve/main/, confere hashes e grava o manifesto', async () => {
    const pasta = mkdtempSync(path.join(tmpdir(), 'modelos-'));
    cpSync('public/models/libs', path.join(pasta, 'libs'), { recursive: true });
    cpSync('scripts/modelos.lock.json', path.join(pasta, 'lock.json'));
    // Libs já presentes e no lock: --verificar não toca a rede.
    await rodar('node', ['scripts/baixar-modelo.mjs', '--verificar'], { env: ambiente(pasta) });
    // Download de verdade: libs de um servidor local (as já baixadas) + pesos do HF falso.
    const libs = createServer((req, res) => res.end(readFileSync(path.join('public/models/libs', path.basename(req.url ?? '')))));
    await new Promise<void>((r) => libs.listen(0, '127.0.0.1', r));
    const porta = (libs.address() as { port: number }).port;
    const env = { ...ambiente(pasta), URL_LIBS_MODELO: `http://127.0.0.1:${porta}/` };
    try {
      await rodar('node', ['scripts/baixar-modelo.mjs', '--modelo', ID], { env });
      const base = path.join(pasta, ID, 'resolve', 'main');
      expect(readFileSync(path.join(base, 'params_shard_0.bin')).equals(pesos)).toBe(true);
      expect(existsSync(path.join(base, '.gitattributes'))).toBe(false);
      const manifesto = JSON.parse(readFileSync(path.join(pasta, ID, 'manifesto.json'), 'utf8')) as { revisao: string; bytes_total: number };
      expect(manifesto.revisao).toBe(REVISAO);
      expect(manifesto.bytes_total).toBe(pesos.length + config.length);
      const lock = JSON.parse(readFileSync(path.join(pasta, 'lock.json'), 'utf8')) as { pesos: Record<string, { revisao: string }> };
      expect(lock.pesos[ID]?.revisao).toBe(REVISAO);

      // Arquivo adulterado no servidor: recusado.
      adulterar = true;
      const outra = mkdtempSync(path.join(tmpdir(), 'modelos-'));
      cpSync(path.join(pasta, 'lock.json'), path.join(outra, 'lock.json'));
      await expect(rodar('node', ['scripts/baixar-modelo.mjs', '--modelo', ID], { env: { ...env, PASTA_MODELOS: outra, LOCK_MODELOS: path.join(outra, 'lock.json') } })).rejects.toThrow(/hash não confere/);
    } finally {
      adulterar = false;
      libs.close();
    }
  }, 30_000);

  it('lib diferente do lock é recusada', async () => {
    const pasta = mkdtempSync(path.join(tmpdir(), 'modelos-'));
    cpSync('scripts/modelos.lock.json', path.join(pasta, 'lock.json'));
    const falso = createServer((_req, res) => res.end(Buffer.from([0x00, 0x61, 0x73, 0x6d, 1, 2, 3])));
    await new Promise<void>((r) => falso.listen(0, '127.0.0.1', r));
    const porta = (falso.address() as { port: number }).port;
    try {
      await expect(rodar('node', ['scripts/baixar-modelo.mjs', '--so-libs'], { env: { ...ambiente(pasta), URL_LIBS_MODELO: `http://127.0.0.1:${porta}/` } })).rejects.toThrow(/SHA-256 diferente/);
      expect(existsSync(path.join(pasta, 'libs'))).toBe(false);
    } finally {
      falso.close();
    }
  });
});
