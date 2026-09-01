"use client";

import { motion } from "framer-motion";
import Logo, { LOGO_AZUL } from "./Logo";
import { EASE_OUT_EXPO } from "@/lib/motion";

/**
 * Loading screen for the hero frame sequence. The logo's own neon curves
 * draw themselves as the frames arrive, so the progress indicator IS the
 * brand — no separate bar competing with it. The percentage stays, but
 * demoted to a quiet caption.
 */
export default function HeroLoader({ progresso }: { progresso: number }) {
  const p = Math.max(0, Math.min(100, Math.round(progresso)));

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-black px-6"
    >
      <div className="relative flex items-center justify-center">
        {/* Brand-blue halo, breathing slowly behind the mark. */}
        <motion.span
          aria-hidden="true"
          animate={{ opacity: [0.2, 0.45, 0.2], scale: [0.94, 1.08, 0.94] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute h-36 w-64 rounded-full blur-3xl sm:h-48 sm:w-96"
          style={{
            background: `radial-gradient(circle, ${LOGO_AZUL}66 0%, transparent 70%)`,
          }}
        />

        <Logo
          className="relative w-64 sm:w-96 lg:w-[26rem]"
          progresso={p / 100}
          // Lettering fades up as the curves complete, so the mark
          // resolves into itself rather than sitting there fully drawn.
          textoOpacidade={0.18 + (p / 100) * 0.82}
        />
      </div>

      <p className="text-[10px] uppercase tracking-[0.45em] text-white/35 sm:text-xs">
        {p}%
      </p>
    </motion.div>
  );
}
