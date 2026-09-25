// CAMINHO FINAL (docs/DECISOES.md, D15): baixa a extensão `parquet` do DuckDB-WASM
// para public/duckdb-extensions/, para o app servir o leitor de Parquet ele mesmo,
// sem nenhuma requisição a extensions.duckdb.org em tempo de uso.
//
// Uso:
//   npm run baixar-extensoes              # baixa, confere o SHA-256 e grava
//   npm run baixar-extensoes:verificar    # só confere os arquivos já baixados
//
// Integridade, em duas camadas:
//   1. SHA-256 conferido contra scripts/extensoes-duckdb.lock.json. No primeiro
//      download de uma versão, o hash ainda não existe: o script registra o hash
//      e pede para fazer commit do lock. Daí em diante, qualquer arquivo diferente
//      é recusado.
//   2. Assinatura digital do DuckDB: ao rodar `LOAD parquet`, o próprio DuckDB-WASM
//      confere a assinatura da extensão e recusa arquivo adulterado.
//
// A versão do motor (ex.: v1.4.3) é lida do próprio @duckdb/duckdb-wasm instalado,
// então o arquivo baixado sempre casa com a versão fixada no package.json.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA_PUBLICA = path.join(RAIZ, 'public', 'duckdb-extensions');
const LOCK = path.join(RAIZ, 'scripts', 'extensoes-duckdb.lock.json');
const MANIFESTO = path.join(RAIZ, 'src', 'data', 'extensoes-duckdb.gerado.json');

const REPOSITORIO = process.env.DUCKDB_EXTENSOES_URL ?? 'https://extensions.duckdb.org';
const EXTENSOES = ['parquet'];
// Os dois bundles que o app carrega (src/data/duckdb.ts): sem e com exceções nativas do WASM.
const PLATAFORMAS = ['wasm_mvp', 'wasm_eh'];
const MAGICO_WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d]);

export function sha256(dados) {
  return createHash('sha256').update(dados).digest('hex');
}

export async function versaoDoMotor() {
  const require = createRequire(import.meta.url);
  const duckdb = require('@duckdb/duckdb-wasm/blocking');
  const dist = path.dirname(require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm'));
  const bundles = {
    mvp: { mainModule: path.join(dist, 'duckdb-mvp.wasm'), mainWorker: path.join(dist, 'duckdb-node-mvp.worker.cjs') },
    eh: { mainModule: path.join(dist, 'duckdb-eh.wasm'), mainWorker: path.join(dist, 'duckdb-node-eh.worker.cjs') },
  };
  const db = await duckdb.createDuckDB(bundles, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
  await db.instantiate(() => {});
  const conn = db.connect();
  const versao = String(conn.query('SELECT version() AS v').toArray()[0].v);
  conn.close();
  // package.json não está no "exports" do pacote: lê pelo caminho, ao lado de dist/.
  const pacote = JSON.parse(await readFile(path.join(dist, '..', 'package.json'), 'utf8'));
  return { versao, pacote: pacote.version };
}

async function lerJson(arquivo, padrao) {
  return existsSync(arquivo) ? JSON.parse(await readFile(arquivo, 'utf8')) : padrao;
}

function caminhoRelativo(plataforma, extensao) {
  return `${plataforma}/${extensao}.duckdb_extension.wasm`;
}

async function baixar(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${url}`);
  const dados = Buffer.from(await resposta.arrayBuffer());
  if (!dados.subarray(0, 4).equals(MAGICO_WASM)) throw new Error(`${url} não é um arquivo WebAssembly`);
  return dados;
}

async function main() {
  const verificar = process.argv.includes('--verificar');
  const { versao, pacote } = await versaoDoMotor();
  console.log(`@duckdb/duckdb-wasm ${pacote} -> motor DuckDB ${versao}`);

  const lock = await lerJson(LOCK, {});
  const hashes = { ...(lock[versao] ?? {}) };
  const aceitos = []; // { relativo, destino, dados }
  const novos = [];
  let falhas = 0;

  // 1ª etapa: obter e conferir tudo, sem gravar nada.
  for (const extensao of EXTENSOES) {
    for (const plataforma of PLATAFORMAS) {
      const relativo = caminhoRelativo(plataforma, extensao);
      const destino = path.join(PASTA_PUBLICA, versao, relativo);
      let dados;
      try {
        if (verificar) {
          if (!existsSync(destino)) throw new Error('arquivo não encontrado');
          dados = await readFile(destino);
        } else {
          const url = `${REPOSITORIO}/${versao}/${relativo}`;
          console.log(`[baixando]  ${url}`);
          dados = await baixar(url);
        }
      } catch (erro) {
        console.log(`[falhou]    ${relativo}: ${erro.message}`);
        falhas++;
        continue;
      }
      const atual = sha256(dados);
      const esperado = hashes[relativo];
      if (esperado && esperado !== atual) {
        console.log(`[RECUSADO]  ${relativo}: SHA-256 ${atual} diferente do lock (${esperado})`);
        falhas++;
        continue;
      }
      if (!esperado) novos.push(relativo);
      console.log(`[ok]        ${relativo} (${(dados.length / 1e6).toFixed(2)} MB, sha256 ${atual.slice(0, 12)}...)`);
      aceitos.push({ relativo, destino, dados, sha256: atual });
    }
  }

  if (falhas) {
    console.log(`\n${falhas} problema(s). Nenhum arquivo foi gravado ou registrado.`);
    process.exitCode = 1;
    return;
  }
  if (verificar) {
    if (novos.length) {
      console.log(`\nSem hash no lock para: ${novos.join(', ')}. Rode npm run baixar-extensoes.`);
      process.exitCode = 1;
      return;
    }
    console.log('\nTudo confere com o lock.');
    return;
  }

  // 2ª etapa: tudo conferido; grava arquivos, lock e manifesto.
  for (const { destino, dados } of aceitos) {
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(`${destino}.parcial`, dados);
    await rename(`${destino}.parcial`, destino);
  }
  for (const { relativo, sha256: hash } of aceitos) hashes[relativo] = hash;
  lock[versao] = Object.fromEntries(Object.entries(hashes).sort());
  await writeFile(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
  const manifesto = {
    comentario: 'Gerado por npm run baixar-extensoes. Não edite à mão.',
    pacote_duckdb_wasm: pacote,
    versao_duckdb: versao,
    extensoes: EXTENSOES,
    plataformas: PLATAFORMAS,
    arquivos: Object.fromEntries(aceitos.map(({ relativo, dados, sha256: hash }) => [relativo, { sha256: hash, bytes: dados.length }])),
  };
  await mkdir(path.dirname(MANIFESTO), { recursive: true });
  await writeFile(MANIFESTO, `${JSON.stringify(manifesto, null, 2)}\n`);
  console.log(`\nGravado em ${path.relative(RAIZ, path.join(PASTA_PUBLICA, versao))}/ e ${path.relative(RAIZ, MANIFESTO)}`);
  if (novos.length) {
    console.log(
      `\nPrimeiro download desta versão: SHA-256 registrado em ${path.relative(RAIZ, LOCK)}.\n` +
        'Faça commit do lock, do manifesto e de public/duckdb-extensions/ para fixar esses arquivos.',
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((erro) => {
    console.error(`ERRO: ${erro.message}`);
    process.exitCode = 1;
  });
}
