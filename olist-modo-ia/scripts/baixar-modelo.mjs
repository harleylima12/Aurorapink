// Baixa o que a IA local precisa para rodar SEM depender de terceiros em tempo de uso (modo "local").
//
// Uso:
//   npm run baixar-modelo -- --so-libs                                 # só as model_lib (.wasm, ~5 MB cada)
//   npm run baixar-modelo -- --modelo Qwen2.5-1.5B-Instruct-q4f16_1-MLC # libs + pesos desse modelo
//   npm run baixar-modelo -- --verificar                               # confere o que já está em public/models
//   (o `npm run build` roda --so-libs antes: baixa só o que falta e confere o SHA-256 do lock)
//
// O que vai para onde (public/models/ fica fora do git: é grande demais):
//   public/models/libs/<arquivo>.wasm                    <- raw.githubusercontent.com (binary-mlc-llm-libs)
//   public/models/<model_id>/resolve/main/<arquivo>      <- huggingface.co (pesos, tokenizer, config)
//   public/models/<model_id>/manifesto.json              <- tamanho real do download e SHA-256 de cada arquivo
// O WebLLM acrescenta "resolve/main/" à URL do modelo (conferido em node_modules, cleanModelUrl), por isso a pasta.
//
// Integridade:
//   - libs: SHA-256 registrado em scripts/modelos.lock.json no 1º download (commitar o lock);
//     depois disso, arquivo diferente é recusado.
//   - pesos: o próprio Hugging Face publica o SHA-256 de cada arquivo LFS (e o hash git dos pequenos);
//     o script confere os dois e fixa a revisão (commit) do repositório no lock.
//
// Variáveis para testes (servidor falso): URL_LIBS_MODELO, URL_HF, PASTA_MODELOS, LOCK_MODELOS.
// Na nuvem do Claude Code o Hugging Face é bloqueado: lá só dá para testar as libs (docs/DECISOES.md D29).

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prebuiltAppConfig } from '@mlc-ai/web-llm';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = process.env.PASTA_MODELOS ?? path.join(RAIZ, 'public', 'models');
const LOCK = process.env.LOCK_MODELOS ?? path.join(RAIZ, 'scripts', 'modelos.lock.json');
const URL_HF = process.env.URL_HF ?? 'https://huggingface.co';
const URL_LIBS_OFICIAL = 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/';
const URL_LIBS = process.env.URL_LIBS_MODELO ?? URL_LIBS_OFICIAL;
const MAGICO_WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d]);

// Mesma lista de src/ai/modelos.ts (PREFERENCIA x variantes).
export const CANDIDATOS = ['Qwen2.5-1.5B-Instruct', 'Qwen3.5-0.8B', 'Llama-3.2-1B-Instruct'].flatMap((b) => [`${b}-q4f16_1-MLC`, `${b}-q4f32_1-MLC`]);

const sha256 = (d) => createHash('sha256').update(d).digest('hex');
const shaGit = (d) => createHash('sha1').update(`blob ${d.length}\0`).update(d).digest('hex');
const mb = (n) => `${(n / 2 ** 20).toFixed(1)} MB`;

function registro(id) {
  const m = prebuiltAppConfig.model_list.find((x) => x.model_id === id);
  if (!m) throw new Error(`${id} não existe na prebuiltAppConfig do WebLLM instalado`);
  return m;
}

/** Caminho da lib relativo ao repositório oficial (ex.: v0_2_84/base/Qwen2-...wasm). */
function libRelativa(m) {
  if (!m.model_lib.startsWith(URL_LIBS_OFICIAL)) throw new Error(`model_lib fora do repositório esperado: ${m.model_lib}`);
  return m.model_lib.slice(URL_LIBS_OFICIAL.length);
}

async function lerJson(arquivo, padrao) {
  return existsSync(arquivo) ? JSON.parse(await readFile(arquivo, 'utf8')) : padrao;
}

async function buscar(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function gravar(destino, dados) {
  await mkdir(path.dirname(destino), { recursive: true });
  const tmp = `${destino}.parcial`;
  await writeFile(tmp, dados);
  await rename(tmp, destino);
}

async function baixarLibs(ids, lock, verificar) {
  lock.libs ??= {};
  const pendentes = [];
  for (const id of ids) {
    const rel = libRelativa(registro(id));
    const arquivo = rel.split('/').pop();
    const destino = path.join(PASTA, 'libs', arquivo);
    let dados;
    const esperadoLock = lock.libs[rel]?.sha256;
    const local = existsSync(destino) ? await readFile(destino) : null;
    if (verificar) {
      if (!local) throw new Error(`falta ${destino}`);
      dados = local;
    } else if (local && esperadoLock && sha256(local) === esperadoLock) {
      // Já baixada e conferida: o build não baixa de novo.
      dados = local;
    } else {
      dados = await buscar(URL_LIBS + rel);
    }
    if (!dados.subarray(0, 4).equals(MAGICO_WASM)) throw new Error(`${rel} não é WebAssembly`);
    const hash = sha256(dados);
    const esperado = lock.libs[rel]?.sha256;
    if (esperado && esperado !== hash) throw new Error(`SHA-256 diferente do lock em ${rel}: ${hash} (esperado ${esperado})`);
    pendentes.push({ rel, destino, dados, hash, novo: !esperado });
  }
  // Só grava depois de validar todos (nada de pasta pela metade).
  for (const p of pendentes) {
    if (!verificar) await gravar(p.destino, p.dados);
    if (p.novo) lock.libs[p.rel] = { sha256: p.hash, bytes: p.dados.length };
    console.log(`${p.novo ? 'registrado' : 'ok'}  libs/${path.basename(p.destino)}  ${mb(p.dados.length)}  sha256 ${p.hash.slice(0, 12)}…`);
  }
  return pendentes.some((p) => p.novo);
}

async function baixarPesos(id, lock) {
  const repo = new URL(registro(id).model).pathname.replace(/^\/+|\/+$/g, '');
  const info = JSON.parse((await buscar(`${URL_HF}/api/models/${repo}`)).toString('utf8'));
  const revisao = lock.pesos?.[id]?.revisao ?? info.sha;
  if (!revisao) throw new Error('o Hugging Face não informou a revisão do repositório');
  const arvore = JSON.parse((await buscar(`${URL_HF}/api/models/${repo}/tree/${revisao}`)).toString('utf8'));
  const arquivos = arvore.filter((a) => a.type === 'file' && !a.path.startsWith('.') && a.path !== 'README.md');
  const base = path.join(PASTA, id, 'resolve', 'main');
  const manifesto = { model_id: id, repo, revisao, baixado_em: new Date().toISOString(), arquivos: [] };
  let total = 0;
  for (const a of arquivos) {
    const destino = path.join(base, a.path);
    const esperadoLfs = a.lfs?.oid ?? a.lfs?.sha256;
    if (existsSync(destino)) {
      const atual = await readFile(destino);
      if ((esperadoLfs && sha256(atual) === esperadoLfs) || (!esperadoLfs && shaGit(atual) === a.oid)) {
        manifesto.arquivos.push({ caminho: a.path, bytes: atual.length, sha256: sha256(atual) });
        total += atual.length;
        continue;
      }
    }
    const dados = await buscar(`${URL_HF}/${repo}/resolve/${revisao}/${a.path}`);
    if (esperadoLfs ? sha256(dados) !== esperadoLfs : shaGit(dados) !== a.oid) throw new Error(`hash não confere em ${a.path}`);
    await gravar(destino, dados);
    manifesto.arquivos.push({ caminho: a.path, bytes: dados.length, sha256: sha256(dados) });
    total += dados.length;
    process.stdout.write(`\r${manifesto.arquivos.length}/${arquivos.length} arquivos, ${mb(total)}   `);
  }
  manifesto.bytes_total = total;
  await gravar(path.join(PASTA, id, 'manifesto.json'), Buffer.from(JSON.stringify(manifesto, null, 2)));
  const novo = !lock.pesos?.[id];
  lock.pesos ??= {};
  lock.pesos[id] = { repo, revisao, bytes_total: total, arquivos: manifesto.arquivos.length };
  console.log(`\n${id}: ${manifesto.arquivos.length} arquivos, ${mb(total)} (revisão ${revisao.slice(0, 12)})`);
  return novo;
}

async function main() {
  const args = process.argv.slice(2);
  const verificar = args.includes('--verificar');
  const soLibs = args.includes('--so-libs');
  const i = args.indexOf('--modelo');
  const modelo = i >= 0 ? args[i + 1] : undefined;
  if (!verificar && !soLibs && !modelo) {
    console.error('Diga o que baixar: --so-libs, --modelo <model_id> ou --verificar.\nCandidatos:\n  ' + CANDIDATOS.join('\n  '));
    process.exit(2);
  }
  if (modelo) registro(modelo);
  const lock = await lerJson(LOCK, {});
  lock.webllm = JSON.parse(await readFile(path.join(RAIZ, 'node_modules', '@mlc-ai', 'web-llm', 'package.json'), 'utf8')).version;

  let mudou = await baixarLibs(CANDIDATOS, lock, verificar);
  if (modelo && !verificar) mudou = (await baixarPesos(modelo, lock)) || mudou;
  if (mudou && !verificar) {
    await gravar(LOCK, Buffer.from(JSON.stringify(lock, null, 2) + '\n'));
    console.log(`\nLock atualizado: ${path.relative(RAIZ, LOCK)}. Faça commit dele.`);
  }
  const libs = Object.values(lock.libs ?? {}).reduce((s, l) => s + l.bytes, 0);
  console.log(`\nLibs dos ${CANDIDATOS.length} candidatos: ${mb(libs)}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`\nERRO: ${e.message}`);
    process.exit(1);
  });
}
