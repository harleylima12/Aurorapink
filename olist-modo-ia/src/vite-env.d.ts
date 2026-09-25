/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'auto' (padrão) | 'parquet' | 'duckdb'. Ver src/data/fonte.ts. */
  readonly VITE_FONTE_DADOS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
