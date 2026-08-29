"use client";

import { motion } from "framer-motion";
import { forwardRef, type ReactNode } from "react";
import { EASE_OUT_EXPO } from "@/lib/motion";

interface RevealOnScrollProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Enable FLIP layout animation (used for lists that reorder/filter). */
  layout?: boolean;
}

const RevealOnScroll = forwardRef<HTMLDivElement, RevealOnScrollProps>(
  function RevealOnScroll({ children, delay = 0, className, layout = false }, ref) {
    return (
      <motion.div
        ref={ref}
        layout={layout}
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        exit={{
          opacity: 0,
          scale: 0.94,
          transition: { duration: 0.2, ease: "easeIn" },
        }}
        transition={{ duration: 0.6, ease: EASE_OUT_EXPO, delay }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }
);

export default RevealOnScroll;
