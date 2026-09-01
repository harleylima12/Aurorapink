"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { CheckIcon, CloseIcon } from "@/components/icons";

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

type TipoToast = "sucesso" | "erro";

interface Toast {
  id: number;
  mensagem: string;
  tipo: TipoToast;
}

interface PedidoConfirmacao {
  titulo: string;
  mensagem: string;
  /** Styles the primary button as destructive and labels it accordingly. */
  destrutivo?: boolean;
  confirmar?: string;
}

interface FeedbackAPI {
  toast: (mensagem: string, tipo?: TipoToast) => void;
  confirmar: (pedido: PedidoConfirmacao) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackAPI | null>(null);

export function useFeedback(): FeedbackAPI {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error("useFeedback precisa estar dentro de <FeedbackProvider>.");
  }
  return ctx;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const proximoId = useRef(0);
  // Held between opening the dialog and the user answering it.
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const toast = useCallback((mensagem: string, tipo: TipoToast = "sucesso") => {
    const id = (proximoId.current += 1);
    setToasts((atuais) => [...atuais, { id, mensagem, tipo }]);
    setTimeout(() => {
      setToasts((atuais) => atuais.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const confirmar = useCallback((novo: PedidoConfirmacao) => {
    setPedido(novo);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const responder = useCallback((ok: boolean) => {
    setPedido(null);
    resolverRef.current?.(ok);
    resolverRef.current = null;
  }, []);

  // Escape always cancels, and the dialog owns the keyboard while open.
  useEffect(() => {
    if (!pedido) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") responder(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pedido, responder]);

  const api = useMemo(() => ({ toast, confirmar }), [toast, confirmar]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur ${
                t.tipo === "erro"
                  ? "border-red-900/60 bg-red-950/90"
                  : "border-emerald-900/60 bg-emerald-950/90"
              }`}
            >
              <CheckIcon
                className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                  t.tipo === "erro" ? "text-red-400" : "text-emerald-400"
                }`}
              />
              <p
                className={`flex-1 text-sm ${
                  t.tipo === "erro" ? "text-red-200" : "text-emerald-200"
                }`}
              >
                {t.mensagem}
              </p>
              <button
                type="button"
                onClick={() =>
                  setToasts((atuais) => atuais.filter((x) => x.id !== t.id))
                }
                aria-label="Fechar aviso"
                className="rounded p-0.5 text-white/40 transition-colors hover:text-white"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Confirmation dialog */}
      <AnimatePresence>
        {pedido && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
            onClick={() => responder(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
              onClick={(e) => e.stopPropagation()}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirmar-titulo"
              className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
            >
              <h2
                id="confirmar-titulo"
                className="font-display text-lg font-semibold text-white"
              >
                {pedido.titulo}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                {pedido.mensagem}
              </p>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => responder(false)}
                  className="rounded-full border border-neutral-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => responder(true)}
                  className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                    pedido.destrutivo
                      ? "bg-red-600 text-white hover:bg-red-500"
                      : "bg-gold-500 text-neutral-950 hover:bg-gold-400"
                  }`}
                >
                  {pedido.confirmar ?? "Confirmar"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </FeedbackContext.Provider>
  );
}
