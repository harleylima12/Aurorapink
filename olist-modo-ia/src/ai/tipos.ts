/** Contrato do "motor de linguagem": o WebLLM de verdade e o motor falso dos testes seguem o mesmo formato. */

export interface MensagemChat {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PedidoCompletar {
  mensagens: MensagemChat[];
  /** JSON Schema (texto) que o XGrammar usa para restringir a saída. */
  schemaJson?: string;
  maxTokens: number;
  /** Recebe o texto parcial durante a geração (streaming). */
  aoParcial?: (textoAteAgora: string) => void;
}

export interface RespostaCompletar {
  texto: string;
  ms: number;
  tokensEntrada?: number;
  tokensSaida?: number;
}

export interface MotorLLM {
  /** Ex.: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC" ou "falso". */
  id: string;
  tipo: 'webllm' | 'falso';
  completar(pedido: PedidoCompletar): Promise<RespostaCompletar>;
}

export interface ProgressoCarga {
  /** 0 a 1. */
  fracao: number;
  texto: string;
  segundos: number;
}
