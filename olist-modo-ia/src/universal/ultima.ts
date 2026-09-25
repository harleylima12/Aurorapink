/**
 * "Lembrar a última planilha" (seção 7A item 11): OPCIONAL e desligado por padrão.
 * Ligado, os bytes dos arquivos ficam no IndexedDB deste navegador (nunca saem do computador), para reabrir
 * sem arrastar de novo. Desligar apaga na hora. A Fase 6 inclui isso no botão "Apagar dados locais".
 */
const BANCO = 'olist-modo-ia';
const LOJA = 'ultima-planilha';
const CHAVE_LIGADO = 'olist-modo-ia:lembrar-planilha';

export interface ArquivoGuardado {
  nome: string;
  bytes: Uint8Array;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA);
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => falha(pedido.error ?? new Error('IndexedDB indisponível'));
  });
}

async function transacao<T>(modo: IDBTransactionMode, acao: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((ok, falha) => {
      const pedido = acao(db.transaction(LOJA, modo).objectStore(LOJA));
      pedido.onsuccess = () => ok(pedido.result);
      pedido.onerror = () => falha(pedido.error ?? new Error('falha no IndexedDB'));
    });
  } finally {
    db.close();
  }
}

export function lembrarLigado(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_LIGADO) === '1';
  } catch {
    return false;
  }
}

export async function definirLembrar(ligado: boolean): Promise<void> {
  try {
    if (ligado) window.localStorage.setItem(CHAVE_LIGADO, '1');
    else window.localStorage.removeItem(CHAVE_LIGADO);
  } catch {
    // sem armazenamento
  }
  if (!ligado) await apagarUltima();
}

export async function guardarUltima(arquivos: readonly ArquivoGuardado[]): Promise<void> {
  if (!lembrarLigado()) return;
  await transacao('readwrite', (l) => l.put(arquivos.map((a) => ({ nome: a.nome, bytes: a.bytes.slice() })), 'arquivos'));
}

export async function lerUltima(): Promise<ArquivoGuardado[] | null> {
  if (!lembrarLigado()) return null;
  try {
    const r = await transacao<unknown>('readonly', (l) => l.get('arquivos'));
    return Array.isArray(r) ? (r as ArquivoGuardado[]) : null;
  } catch {
    return null;
  }
}

export async function apagarUltima(): Promise<void> {
  try {
    await transacao('readwrite', (l) => l.delete('arquivos'));
  } catch {
    // nada guardado
  }
}
