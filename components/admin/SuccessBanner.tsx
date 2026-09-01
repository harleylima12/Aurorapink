"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { EASE_OUT_EXPO } from "@/lib/motion";

const MENSAGENS: Record<string, string> = {
  criado: "Veículo cadastrado com sucesso!",
  editado: "Alterações salvas com sucesso!",
};

export default function SuccessBanner({ status }: { status?: string }) {
  const mensagem = status ? MENSAGENS[status] : undefined;
  const [visible, setVisible] = useState(Boolean(mensagem));

  useEffect(() => {
    if (!mensagem) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, [mensagem]);

  if (!mensagem) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
          className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-900/50 bg-emerald-950/40 px-4 py-3"
        >
          <CheckIcon className="h-5 w-5 flex-shrink-0 text-emerald-400" />
          <p className="flex-1 text-sm text-emerald-300">{mensagem}</p>
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Fechar aviso"
            className="rounded-lg p-1 text-emerald-400/70 transition-colors hover:bg-emerald-900/40 hover:text-emerald-300"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
