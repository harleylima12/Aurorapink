"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

const TOTAL_FRAMES = 300;
const framePath = (frame: number) =>
  `/hero-frames/frame-${String(frame).padStart(3, "0")}.jpg`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default function HeroScrollVideo() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const currentFrameRef = useRef(0);
  const tickingRef = useRef(false);

  const [loadProgress, setLoadProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  const drawFrame = useCallback((frameIndex: number) => {
    const canvas = canvasRef.current;
    const img = imagesRef.current[frameIndex];
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const canvasRatio = canvasWidth / canvasHeight;

    let drawWidth: number;
    let drawHeight: number;

    if (canvasRatio > imgRatio) {
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imgRatio;
    } else {
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * imgRatio;
    }

    const offsetX = (canvasWidth - drawWidth) / 2;
    const offsetY = (canvasHeight - drawHeight) / 2;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }, []);

  const updateFrameFromScroll = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const scrollableHeight = rect.height - window.innerHeight;
    const scrolled = -rect.top;
    const fraction =
      scrollableHeight > 0 ? clamp(scrolled / scrollableHeight, 0, 1) : 0;

    const frameIndex = Math.min(
      TOTAL_FRAMES - 1,
      Math.floor(fraction * TOTAL_FRAMES)
    );

    currentFrameRef.current = frameIndex;
    drawFrame(frameIndex);
  }, [drawFrame]);

  // Preload every frame before allowing scroll-scrubbing to begin.
  useEffect(() => {
    let cancelled = false;
    let loadedCount = 0;
    const images: HTMLImageElement[] = new Array(TOTAL_FRAMES);

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const img = new Image();
      img.src = framePath(i + 1);
      img.onload = img.onerror = () => {
        if (cancelled) return;
        loadedCount += 1;
        setLoadProgress(Math.round((loadedCount / TOTAL_FRAMES) * 100));
        if (loadedCount === TOTAL_FRAMES) setIsLoaded(true);
      };
      images[i] = img;
    }
    imagesRef.current = images;

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the canvas backing store crisp and sized to the viewport.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let resizeTimeout: ReturnType<typeof setTimeout>;

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      drawFrame(currentFrameRef.current);
    };

    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeCanvas, 150);
    };

    resizeCanvas();
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
    };
  }, [drawFrame]);

  // Frame is derived purely from scroll position, throttled via rAF.
  useEffect(() => {
    if (!isLoaded) return;

    const handleScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        updateFrameFromScroll();
        tickingRef.current = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    updateFrameFromScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [isLoaded, updateFrameFromScroll]);

  return (
    <section ref={sectionRef} className="relative h-[400vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-black">
        <canvas ref={canvasRef} aria-hidden="true" className="h-full w-full" />

        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/20 to-black/50" />

        <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={isLoaded ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex max-w-3xl flex-col items-center gap-6 text-center"
          >
            <h1 className="text-4xl font-bold text-white sm:text-5xl md:text-6xl">
              Encontre seu próximo carro na Alvorada Veículos
            </h1>
            <p className="text-base text-white/80 sm:text-lg">
              Veículos revisados, procedência garantida e condições facilitadas
              para você sair dirigindo hoje.
            </p>
            <Link
              href="/veiculos"
              className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-white/90"
            >
              Ver estoque completo
            </Link>
          </motion.div>
        </div>

        {!isLoaded && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black">
            <div className="h-px w-40 overflow-hidden bg-white/20">
              <div
                className="h-full bg-white transition-[width] duration-150 ease-out"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">
              {loadProgress}%
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
