/**
 * Qual arquivo de dados o app carrega (lógica pura, testada em tests/unit/funcoes.test.ts).
 *
 * - FINAL: `fato_itens.parquet` + extensão `parquet` servida pelo próprio app
 *   (public/duckdb-extensions/, criada por `npm run baixar-extensoes`).
 * - PROVISÓRIO: `provisorio/fato_itens.duckdb`, que o DuckDB lê sem extensão.
 *   Existe porque a extensão não pôde ser baixada no ambiente de nuvem da Fase 2
 *   (docs/DECISOES.md, D17). Os dados são os mesmos do Parquet.
 */
import { z } from '../zod';

export const manifestoExtensoesSchema = z.object({
  pacote_duckdb_wasm: z.string(),
  versao_duckdb: z.string().regex(/^v\d+\.\d+\.\d+$/),
  extensoes: z.array(z.string()).min(1),
  plataformas: z.array(z.string()).min(1),
  arquivos: z.record(z.string(), z.object({ sha256: z.string().length(64), bytes: z.number().int().positive() })),
});
export type ManifestoExtensoes = z.infer<typeof manifestoExtensoesSchema>;

export type Preferencia = 'auto' | 'parquet' | 'duckdb';
export type TipoFonte = 'parquet' | 'duckdb-provisorio';

export interface InfoFonte {
  tipo: TipoFonte;
  /** Caminho servido pelo app, relativo à raiz do site. */
  arquivo: string;
  bytes: number;
  versaoDuckdb: string;
  /** Por que o app está no caminho provisório (vazio no caminho final). */
  motivo?: string;
}

export const ARQUIVOS: Record<TipoFonte, string> = {
  parquet: 'data/fato_itens.parquet',
  'duckdb-provisorio': 'data/provisorio/fato_itens.duckdb',
};

export const PASTA_EXTENSOES = 'duckdb-extensions';

export function lerPreferencia(valor: string | undefined): Preferencia {
  return valor === 'parquet' || valor === 'duckdb' ? valor : 'auto';
}

/** Lê o manifesto gerado pelo script; qualquer coisa inválida conta como "sem manifesto". */
export function lerManifesto(bruto: unknown): ManifestoExtensoes | null {
  const resultado = manifestoExtensoesSchema.safeParse(bruto);
  return resultado.success ? resultado.data : null;
}

export type Plano =
  | { tipo: 'parquet' }
  | { tipo: 'duckdb-provisorio'; motivo: string };

/** Decide o caminho antes de carregar qualquer coisa. */
export function planejarFonte(preferencia: Preferencia, manifesto: ManifestoExtensoes | null): Plano {
  if (preferencia === 'duckdb') {
    return { tipo: 'duckdb-provisorio', motivo: 'VITE_FONTE_DADOS=duckdb força o caminho provisório' };
  }
  if (!manifesto || !manifesto.extensoes.includes('parquet')) {
    return {
      tipo: 'duckdb-provisorio',
      motivo: 'extensão parquet não encontrada no app (rode npm run baixar-extensoes)',
    };
  }
  return { tipo: 'parquet' };
}

/** A extensão só funciona na mesma versão do motor para a qual foi baixada. */
export function conferirVersao(manifesto: ManifestoExtensoes, versaoMotor: string): string | null {
  return manifesto.versao_duckdb === versaoMotor
    ? null
    : `extensão baixada para ${manifesto.versao_duckdb}, mas o motor é ${versaoMotor} (rode npm run baixar-extensoes)`;
}

/** Aspas simples escapadas para um literal SQL (URLs e nomes de arquivo nossos, nunca texto do usuário). */
export function literalSql(texto: string): string {
  return `'${texto.replaceAll("'", "''")}'`;
}
