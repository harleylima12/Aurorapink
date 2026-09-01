"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { EASE_OUT_EXPO } from "@/lib/motion";

// Next.js creates a fresh instance of `template.tsx` on every navigation
// (unlike layout.tsx, which persists), so this replays a clean fade-in
// each time instead of the browser's hard cut between pages.
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}
