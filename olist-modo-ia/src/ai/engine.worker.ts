/**
 * Worker do WebLLM: o modelo roda FORA da thread da interface (a tela não trava enquanto ele gera).
 * O worker só existe depois que a pessoa clica em "Ativar IA local" (import dinâmico no motorWebLLM).
 */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (mensagem: MessageEvent) => handler.onmessage(mensagem);
