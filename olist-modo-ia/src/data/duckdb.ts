/**
 * Motor de dados: DuckDB-WASM rodando num Web Worker (a tela nunca trava).
 *
 * Tudo vem do próprio site (P3): os .wasm e os workers do DuckDB são copiados
 * pelo Vite (imports `?url`), nada de jsDelivr. O autoload de extensões fica
 * desligado para o DuckDB nunca buscar nada em extensions.duckdb.org sozinho.
 */
import * as duckdb from '@duckdb/duckdb-wasm';
import wasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import wasmMvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import workerEh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import workerMvp from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';

import {
  ARQUIVOS,
  PASTA_EXTENSOES,
  conferirVersao,
  lerManifesto,
  lerPreferencia,
  literalSql,
  planejarFonte,
  type InfoFonte,
  type ManifestoExtensoes,
} from './fonte';

export type Valor = string | number | boolean | null;
export type Linha = Record<string, Valor>;
export type Parametro = string | number;

export interface Resultado {
  linhas: Linha[];
  ms: number;
  /** true quando veio do cache (a consulta não rodou de novo). */
  doCache: boolean;
}

export interface TemposCarga {
  /** Baixar e compilar o WASM + abrir o banco. */
  motorMs: number;
  /** Baixar o arquivo de dados e registrar a tabela. */
  dadosMs: number;
  totalMs: number;
}

export interface Motor {
  fonte: InfoFonte;
  versaoPacote: string;
  tempos: TemposCarga;
  consultar(sql: string, params?: readonly Parametro[]): Promise<Resultado>;
}

// O manifesto só existe depois de `npm run baixar-extensoes` (caminho final).
const manifestos = import.meta.glob('./extensoes-duckdb.gerado.json', { eager: true, import: 'default' });
const manifesto: ManifestoExtensoes | null = lerManifesto(Object.values(manifestos)[0]);

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: wasmMvp, mainWorker: workerMvp },
  eh: { mainModule: wasmEh, mainWorker: workerEh },
};

function url(relativo: string): string {
  return new URL(relativo, document.baseURI).href;
}

async function baixar(relativo: string): Promise<Uint8Array> {
  const resposta = await fetch(url(relativo));
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} ao baixar ${relativo}`);
  return new Uint8Array(await resposta.arrayBuffer());
}

function normalizar(valor: unknown): Valor {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') return valor;
  if (typeof valor === 'bigint') return Number(valor);
  if (valor instanceof Date) return valor.toISOString();
  return String(valor);
}

function paraLinhas(tabela: { toArray(): unknown[] }): Linha[] {
  return tabela.toArray().map((linha) => {
    const objeto = (linha as { toJSON(): Record<string, unknown> }).toJSON();
    return Object.fromEntries(Object.entries(objeto).map(([chave, valor]) => [chave, normalizar(valor)]));
  });
}

/** CAMINHO FINAL: extensão parquet servida pelo app + fato_itens.parquet. */
async function carregarParquet(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  dados: Promise<Uint8Array>,
  versao: string,
  manifestoAtual: ManifestoExtensoes,
): Promise<InfoFonte> {
  const erroVersao = conferirVersao(manifestoAtual, versao);
  if (erroVersao) throw new Error(erroVersao);
  const repositorio = url(PASTA_EXTENSOES).replace(/\/$/, '');
  await conn.query(`SET custom_extension_repository = ${literalSql(repositorio)}`);
  await conn.query('LOAD parquet');
  const bytes = await dados;
  const tamanho = bytes.length; // registerFileBuffer transfere o buffer para o worker (ele fica vazio aqui)
  await db.registerFileBuffer('fato_itens.parquet', bytes);
  await conn.query("CREATE OR REPLACE VIEW fato_itens AS SELECT * FROM read_parquet('fato_itens.parquet')");
  return { tipo: 'parquet', arquivo: ARQUIVOS.parquet, bytes: tamanho, versaoDuckdb: versao };
}

/** CAMINHO PROVISÓRIO (D17): arquivo .duckdb, lido sem extensão nenhuma. */
async function carregarProvisorio(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  dados: Promise<Uint8Array>,
  versao: string,
  motivo: string,
): Promise<InfoFonte> {
  const bytes = await dados;
  const tamanho = bytes.length; // registerFileBuffer transfere o buffer para o worker (ele fica vazio aqui)
  await db.registerFileBuffer('fato_itens.duckdb', bytes);
  await conn.query("ATTACH 'fato_itens.duckdb' AS provisorio (READ_ONLY)");
  await conn.query('CREATE OR REPLACE VIEW fato_itens AS SELECT * FROM provisorio.fato_itens');
  return { tipo: 'duckdb-provisorio', arquivo: ARQUIVOS['duckdb-provisorio'], bytes: tamanho, versaoDuckdb: versao, motivo };
}

export async function iniciarMotor(): Promise<Motor> {
  const inicio = performance.now();
  const plano = planejarFonte(lerPreferencia(import.meta.env.VITE_FONTE_DADOS), manifesto);
  // O download dos dados começa junto com o do WASM, em paralelo.
  const dadosPlanejados = baixar(ARQUIVOS[plano.tipo]);
  dadosPlanejados.catch(() => undefined); // tratado mais abaixo

  const bundle = await duckdb.selectBundle(BUNDLES);
  if (!bundle.mainWorker) throw new Error('bundle do DuckDB sem worker');
  const worker = new Worker(bundle.mainWorker);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  await db.open({ query: { castBigIntToDouble: true, castDecimalToDouble: true } });
  const conn = await db.connect();
  await conn.query('SET autoinstall_known_extensions = false');
  await conn.query('SET autoload_known_extensions = false');
  const versao = await db.getVersion();
  const fimMotor = performance.now();

  let fonte: InfoFonte;
  if (plano.tipo === 'parquet' && manifesto) {
    try {
      fonte = await carregarParquet(db, conn, dadosPlanejados, versao, manifesto);
    } catch (erro) {
      // P4: se o caminho final falhar, o dashboard continua funcionando, com aviso.
      const motivo = `caminho final falhou: ${erro instanceof Error ? erro.message : String(erro)}`;
      fonte = await carregarProvisorio(db, conn, baixar(ARQUIVOS['duckdb-provisorio']), versao, motivo);
    }
  } else {
    fonte = await carregarProvisorio(db, conn, dadosPlanejados, versao, plano.tipo === 'duckdb-provisorio' ? plano.motivo : '');
  }
  const fim = performance.now();

  const cache = new Map<string, Promise<Resultado>>();

  async function executar(sql: string, params: readonly Parametro[]): Promise<Resultado> {
    const t0 = performance.now();
    let linhas: Linha[];
    if (params.length === 0) {
      linhas = paraLinhas(await conn.query(sql));
    } else {
      // Consulta parametrizada: valores nunca são colados no texto do SQL.
      const preparada = await conn.prepare(sql);
      try {
        linhas = paraLinhas(await preparada.query(...params));
      } finally {
        await preparada.close();
      }
    }
    return { linhas, ms: performance.now() - t0, doCache: false };
  }

  return {
    fonte,
    versaoPacote: duckdb.PACKAGE_VERSION,
    tempos: { motorMs: fimMotor - inicio, dadosMs: fim - fimMotor, totalMs: fim - inicio },
    consultar(sql, params = []) {
      // Cache por SQL + parâmetros: a mesma pergunta não roda duas vezes.
      const chave = `${sql}\u0000${JSON.stringify(params)}`;
      const existente = cache.get(chave);
      if (existente) return existente.then((r) => ({ ...r, ms: 0, doCache: true }));
      const pendente = executar(sql, params);
      pendente.catch(() => cache.delete(chave));
      cache.set(chave, pendente);
      return pendente;
    },
  };
}
