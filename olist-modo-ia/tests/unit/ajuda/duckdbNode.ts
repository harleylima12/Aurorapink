/**
 * DuckDB-WASM (o MESMO pacote e motor v1.4.3 do navegador) rodando no Node,
 * para testar o SQL gerado pelo compilador contra os dados reais.
 *
 * Usa o arquivo provisório .duckdb, porque a extensão parquet não está
 * disponível neste ambiente (docs/DECISOES.md, D17).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

type Valor = string | number | boolean | null;
export type Linha = Record<string, Valor>;

interface TabelaArrow {
  toArray(): { toJSON(): Record<string, unknown> }[];
}
interface Preparada {
  query(...params: (string | number)[]): TabelaArrow;
  close(): void;
}
interface Conexao {
  query(sql: string): TabelaArrow;
  prepare(sql: string): Preparada;
}
interface Bindings {
  instantiate(progresso: () => void): Promise<unknown>;
  open(config: object): void;
  connect(): Conexao;
  registerFileBuffer(nome: string, dados: Uint8Array): void;
}
interface ModuloDuckdb {
  createDuckDB(bundles: object, logger: object, runtime: object): Promise<Bindings>;
  VoidLogger: new () => object;
  NODE_RUNTIME: object;
}

export const RAIZ = path.resolve(import.meta.dirname, '..', '..', '..');

function normalizar(valor: unknown): Valor {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'bigint') return Number(valor);
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') return valor;
  return String(valor);
}

export interface BancoTeste {
  consultar(sql: string, params?: readonly (string | number)[]): Linha[];
}

export async function abrirBancoTeste(): Promise<BancoTeste> {
  const require = createRequire(import.meta.url);
  const duckdb = require('@duckdb/duckdb-wasm/blocking') as ModuloDuckdb;
  const dist = path.dirname(require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm'));
  const bundles = {
    mvp: { mainModule: path.join(dist, 'duckdb-mvp.wasm'), mainWorker: path.join(dist, 'duckdb-node-mvp.worker.cjs') },
    eh: { mainModule: path.join(dist, 'duckdb-eh.wasm'), mainWorker: path.join(dist, 'duckdb-node-eh.worker.cjs') },
  };
  const db = await duckdb.createDuckDB(bundles, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
  await db.instantiate(() => undefined);
  db.open({ query: { castBigIntToDouble: true, castDecimalToDouble: true } });
  const conn = db.connect();
  conn.query('SET autoinstall_known_extensions = false');
  conn.query('SET autoload_known_extensions = false');
  db.registerFileBuffer(
    'fato_itens.duckdb',
    new Uint8Array(readFileSync(path.join(RAIZ, 'public', 'data', 'provisorio', 'fato_itens.duckdb'))),
  );
  conn.query("ATTACH 'fato_itens.duckdb' AS provisorio (READ_ONLY)");
  conn.query('CREATE VIEW fato_itens AS SELECT * FROM provisorio.fato_itens');

  const paraLinhas = (t: TabelaArrow): Linha[] =>
    t.toArray().map((l) => Object.fromEntries(Object.entries(l.toJSON()).map(([k, v]) => [k, normalizar(v)])));

  return {
    consultar(sql, params = []) {
      if (params.length === 0) return paraLinhas(conn.query(sql));
      const preparada = conn.prepare(sql);
      try {
        return paraLinhas(preparada.query(...params));
      } finally {
        preparada.close();
      }
    },
  };
}
