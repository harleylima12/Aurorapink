/*
 * Service Worker "firewall" + cache offline (Fase 6, seção 15 da especificação).
 *
 * 1. Vê TODAS as requisições da página e dos workers controlados por ela (DuckDB, IA), registra as que vão
 *    para fora do site e avisa as abas abertas (é daqui que sai o contador "Requisições externas").
 * 2. Modo estrito (?modo=estrito, build com VITE_MODEL_SOURCE=local): bloqueia qualquer requisição externa.
 *    A CSP já bloqueia; esta é a segunda barreira, e a que CONTA.
 * 3. Offline (PWA): guarda no Cache Storage o que o app já usou (código, WASM, dados, extensão). Os pesos do
 *    modelo ficam de fora: o próprio WebLLM guarda os dele.
 *
 * JavaScript puro (sem build) para ser servido como está em /sw.js, com escopo no site inteiro.
 */
const MODO = new URL(self.location.href).searchParams.get('modo') === 'estrito' ? 'estrito' : 'demo';
const VERSAO = 'v1';
const CACHE = `olist-modo-ia-app-${VERSAO}`;
const RECENTES = [];
let externas = 0;
let bloqueadas = 0;
/** Requisições do próprio site por quem pediu: prova de que os workers (DuckDB, IA) passam por aqui. */
const PORORIGEM = { 'página': 0, worker: 0, desconhecido: 0 };

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nome of await caches.keys()) if (nome.startsWith('olist-modo-ia-app-') && nome !== CACHE) await caches.delete(nome);
      await self.clients.claim();
    })(),
  );
});

async function avisar(registro) {
  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
  for (const j of janelas) j.postMessage({ tipo: 'firewall', registro, externas, bloqueadas, modo: MODO });
}

async function tipoDoCliente(id) {
  if (!id) return 'página';
  const c = await self.clients.get(id);
  return c ? (c.type === 'window' ? 'página' : 'worker') : 'desconhecido';
}

self.addEventListener('message', (evento) => {
  if (evento.data?.tipo === 'estado') {
    evento.source?.postMessage({ tipo: 'firewall-estado', externas, bloqueadas, modo: MODO, recentes: RECENTES.slice(-20), porOrigem: PORORIGEM });
  }
});

/** O que vale guardar para funcionar offline: arquivos do próprio site, menos os pesos do modelo. */
function guardavel(url, pedido) {
  if (pedido.method !== 'GET' || pedido.headers.has('range')) return false;
  if (url.pathname.startsWith('/models/')) return false;
  return true;
}

async function daRedeOuCache(pedido, chave) {
  const cache = await caches.open(CACHE);
  try {
    const resposta = await fetch(pedido);
    if (resposta.ok && resposta.type === 'basic') await cache.put(chave ?? pedido, resposta.clone());
    return resposta;
  } catch (erro) {
    const guardada = await cache.match(chave ?? pedido);
    if (guardada) return guardada;
    throw erro;
  }
}

async function doCacheOuRede(pedido) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(pedido);
  if (guardada) return guardada;
  const resposta = await fetch(pedido);
  if (resposta.ok && resposta.type === 'basic') await cache.put(pedido, resposta.clone());
  return resposta;
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.origin !== self.location.origin) {
    const bloquear = MODO === 'estrito';
    externas += 1;
    if (bloquear) bloqueadas += 1;
    evento.waitUntil(
      (async () => {
        const registro = { host: url.host, caminho: url.pathname.slice(0, 80), destino: pedido.destination || 'fetch', origem: await tipoDoCliente(evento.clientId), bloqueada: bloquear, em: Date.now() };
        RECENTES.push(registro);
        if (RECENTES.length > 200) RECENTES.shift();
        await avisar(registro);
      })(),
    );
    if (bloquear) evento.respondWith(Response.error());
    return;
  }

  evento.waitUntil(tipoDoCliente(evento.clientId || evento.resultingClientId).then((t) => (PORORIGEM[t] = (PORORIGEM[t] ?? 0) + 1)));
  if (!guardavel(url, pedido)) return;
  if (pedido.mode === 'navigate') {
    // Página: rede primeiro (versão nova), cache se estiver offline. Toda rota do app usa o mesmo index.html.
    evento.respondWith(daRedeOuCache(pedido, '/index.html'));
  } else if (url.pathname.startsWith('/assets/')) {
    // Nome com hash: nunca muda, cache primeiro.
    evento.respondWith(doCacheOuRede(pedido));
  } else {
    evento.respondWith(daRedeOuCache(pedido));
  }
});
