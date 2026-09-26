/**
 * Lado da página do Service Worker "firewall" (public/sw.js).
 *
 * O SW é registrado ANTES de o DuckDB começar (main.tsx), e a página espera ele assumir o controle: assim até
 * o worker do DuckDB da primeira visita já nasce sob o SW (senão as requisições dele escapariam do contador).
 * Contador = requisições externas vistas pelo SW desde que esta aba abriu + as da própria página que
 * aconteceram antes do SW assumir (Resource Timing), sem contar duas vezes.
 */
export type ModoPrivacidade = 'estrito' | 'demo';

export interface RegistroRede {
  host: string;
  caminho: string;
  destino: string;
  origem: string;
  bloqueada: boolean;
  em: number;
}

export interface EstadoFirewall {
  ativo: boolean;
  modo: ModoPrivacidade;
  externas: number;
  bloqueadas: number;
  recentes: RegistroRede[];
  /** Motivo quando o SW não está ativo (dev, navegador sem suporte). */
  motivo?: string;
}

export const MODO: ModoPrivacidade = import.meta.env.VITE_MODEL_SOURCE === 'local' ? 'estrito' : 'demo';

let estado: EstadoFirewall = { ativo: false, modo: MODO, externas: 0, bloqueadas: 0, recentes: [] };
const ouvintes = new Set<(e: EstadoFirewall) => void>();

function publicar(novo: EstadoFirewall) {
  estado = novo;
  for (const o of ouvintes) o(estado);
}

export function lerEstado(): EstadoFirewall {
  return estado;
}

export function ouvir(f: (e: EstadoFirewall) => void): () => void {
  ouvintes.add(f);
  f(estado);
  return () => ouvintes.delete(f);
}

function externasAntesDoSW(): RegistroRede[] {
  return performance
    .getEntriesByType('resource')
    .filter((r) => {
      try {
        return new URL(r.name).origin !== location.origin && !/^(data|blob):/.test(r.name);
      } catch {
        return false;
      }
    })
    .map((r) => ({ host: new URL(r.name).host, caminho: new URL(r.name).pathname.slice(0, 80), destino: 'recurso', origem: 'página', bloqueada: false, em: Date.now() }));
}

let pronto: Promise<void> | null = null;

/** O motor de dados espera por isto: o worker do DuckDB só nasce depois que o firewall assumiu (ou desistiu). */
export function firewallPronto(): Promise<void> {
  pronto ??= registrar(3000);
  return pronto;
}

export const iniciarFirewall = firewallPronto;

/** Registra o SW e espera ele controlar a página (no máximo `esperaMs`). Nunca derruba o app. */
async function registrar(esperaMs: number): Promise<void> {
  if (import.meta.env.DEV) {
    publicar({ ...estado, motivo: 'desligado no npm run dev (o HMR do Vite não combina com Service Worker)' });
    return;
  }
  if (!('serviceWorker' in navigator)) {
    publicar({ ...estado, motivo: 'este navegador não tem Service Worker: só a CSP protege' });
    return;
  }
  const antes = externasAntesDoSW();
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ tipo: string; registro?: RegistroRede; bloqueadas?: number }>) => {
    if (e.data.tipo !== 'firewall' || !e.data.registro) return;
    const r = e.data.registro;
    publicar({ ...estado, externas: estado.externas + 1, bloqueadas: estado.bloqueadas + (r.bloqueada ? 1 : 0), recentes: [...estado.recentes, r].slice(-50) });
  });
  try {
    await navigator.serviceWorker.register(`/sw.js?modo=${MODO}`, { scope: '/' });
    if (!navigator.serviceWorker.controller) {
      await Promise.race([
        new Promise<void>((ok) => navigator.serviceWorker.addEventListener('controllerchange', () => ok(), { once: true })),
        new Promise<void>((ok) => window.setTimeout(ok, esperaMs)),
      ]);
    }
    const ativo = Boolean(navigator.serviceWorker.controller);
    publicar({
      ...estado,
      ativo,
      externas: estado.externas + antes.length,
      recentes: [...antes, ...estado.recentes],
      ...(ativo ? {} : { motivo: 'o Service Worker não assumiu a página a tempo' }),
    });
  } catch (erro) {
    publicar({ ...estado, motivo: `não consegui registrar o Service Worker: ${erro instanceof Error ? erro.message : String(erro)}` });
  }
}
