/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'auto' (padrão) | 'parquet' | 'duckdb'. Ver src/data/fonte.ts. */
  readonly VITE_FONTE_DADOS?: string;
  /** Pesos do modelo: 'demo' (Hugging Face, padrão) | 'local' (/models/, via npm run baixar-modelo). */
  readonly VITE_MODEL_SOURCE?: string;
  /** Força um model_id da prebuiltAppConfig (ex.: Llama-3.2-1B-Instruct-q4f16_1-MLC). */
  readonly VITE_MODELO?: string;
  /** '1' só no build dos testes e2e: libera ?motor=falso. */
  readonly VITE_PERMITIR_MOTOR_FALSO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
