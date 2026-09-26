/**
 * "Apagar dados locais" (seção 14): tudo que o app guardou NESTE navegador.
 * Cache Storage (código do app e pesos do modelo), IndexedDB (última planilha), OPFS e localStorage/sessionStorage
 * (fixados, avaliações, modelos de planilha, preferências). O Service Worker continua registrado (a proteção
 * não pode sumir), mas o cache dele é apagado junto.
 */
export interface RelatorioApagar {
  antesMB: number | null;
  depoisMB: number | null;
  caches: string[];
  /** Soma do Content-Length do que estava nos caches (a estimativa do navegador demora a atualizar). */
  cacheMB: number;
  bancos: string[];
  arquivosOpfs: number;
  chaves: number;
  erros: string[];
}

async function usoMB(): Promise<number | null> {
  try {
    const e = await navigator.storage.estimate();
    return e.usage !== undefined ? e.usage / 2 ** 20 : null;
  } catch {
    return null;
  }
}

interface DiretorioOpfs {
  keys(): AsyncIterableIterator<string>;
  removeEntry(nome: string, opcoes?: { recursive?: boolean }): Promise<void>;
}

export async function apagarDadosLocais(): Promise<RelatorioApagar> {
  const r: RelatorioApagar = { antesMB: await usoMB(), depoisMB: null, caches: [], cacheMB: 0, bancos: [], arquivosOpfs: 0, chaves: 0, erros: [] };
  try {
    for (const nome of await caches.keys()) {
      const cache = await caches.open(nome);
      for (const pedido of await cache.keys()) {
        const resposta = await cache.match(pedido);
        r.cacheMB += Number(resposta?.headers.get('content-length') ?? 0) / 2 ** 20;
      }
      await caches.delete(nome);
      r.caches.push(nome);
    }
  } catch (e) {
    r.erros.push(`Cache Storage: ${String(e)}`);
  }
  try {
    for (const db of await indexedDB.databases()) {
      if (!db.name) continue;
      await new Promise<void>((ok) => {
        const pedido = indexedDB.deleteDatabase(db.name ?? '');
        pedido.onsuccess = pedido.onerror = pedido.onblocked = () => ok();
      });
      r.bancos.push(db.name);
    }
  } catch (e) {
    r.erros.push(`IndexedDB: ${String(e)}`);
  }
  try {
    const raiz = (await navigator.storage.getDirectory()) as unknown as DiretorioOpfs;
    for await (const nome of raiz.keys()) {
      await raiz.removeEntry(nome, { recursive: true });
      r.arquivosOpfs++;
    }
  } catch (e) {
    r.erros.push(`OPFS: ${String(e)}`);
  }
  try {
    r.chaves = localStorage.length + sessionStorage.length;
    localStorage.clear();
    sessionStorage.clear();
  } catch (e) {
    r.erros.push(`localStorage: ${String(e)}`);
  }
  r.depoisMB = await usoMB();
  return r;
}
