"use client";

import { useEffect, useRef } from "react";
import { animate, useInView } from "framer-motion";
import { EASE_OUT_EXPO } from "@/lib/motion";

export default function CountUp({
  value,
  duration = 0.8,
  format,
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10% 0px" });
  const hasAnimatedRef = useRef(false);
  const formatted = format ? format(value) : String(value);

  useEffect(() => {
    const node = ref.current;
    if (!node || !isInView || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    const controls = animate(0, value, {
      duration,
      ease: EASE_OUT_EXPO,
      onUpdate: (v) => {
        node.textContent = format ? format(Math.round(v)) : String(Math.round(v));
      },
      onComplete: () => {
        node.textContent = formatted;
      },
    });

    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInView, value, duration]);

  // Server/first paint renders the real final value — no flash of blank
  // content and no-JS/SEO stay correct. The count-up is a progressive
  // enhancement layered on top once the element first enters view.
  return (
    <span ref={ref} className={className}>
      {formatted}
    </span>
  );
}
