"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { EASE_OUT_EXPO } from "@/lib/motion";
import HeroLoader from "./HeroLoader";

const MotionLink = motion.create(Link);

const TOTAL_FRAMES = 300;

// Frames needed before scrubbing is unlocked. The rest stream in behind
// the scenes, so the visitor waits on ~10% of the sequence instead of
// all 7 MB of it.
const LOTE_INICIAL = 30;

// How many of the remaining frames to fetch at once. Browsers cap
// concurrent connections per host anyway; small batches keep the
// already-loaded range growing in order instead of at random.
const LOTE_FUNDO = 12;
const framePath = (frame: number) =>
  `/hero-frames/frame-${String(frame).padStart(3, "0")}.jpg`;

// Below this canvas-width/height ratio relative to the frame's own ratio,
// a pure "cover" fit would need to zoom in so far that the car gets cropped
// out of frame (portrait / narrow mobile viewports). Switch to the hybrid
// fit-width layout instead once the viewport is this much narrower than
// the source frame's aspect ratio.
const NARROW_RATIO_FACTOR = 0.85;

// Default vertical object-position anchor ("center 35%"): slightly above
// center, so the roofline and wheels stay in frame instead of the crop
// or the letterbox gap favoring the exact middle of the image.
const DEFAULT_FOCAL_Y = 0.35;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

interface HeroScrollVideoProps {
  /** Vertical object-position anchor (0 = top of frame, 1 = bottom). */
  focalY?: number;
}

export default function HeroScrollVideo({
  focalY = DEFAULT_FOCAL_Y,
}: HeroScrollVideoProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const carregadasRef = useRef<boolean[]>([]);
  const currentFrameRef = useRef(0);
  const tickingRef = useRef(false);

  const [loadProgress, setLoadProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Subtle parallax on the text overlay only — the canvas frame mapping
  // below is untouched. As the user scrolls through the hero section the
  // overlay drifts down and fades slightly slower than the raw scroll,
  // reading as depth against the "fixed" background.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const overlayY = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const overlayOpacity = useTransform(
    scrollYProgress,
    [0, 0.6, 1],
    [1, 1, 0]
  );

  // With frames streaming in, a fast scroll can land on one that hasn't
  // arrived. Draw the closest frame that has, so the canvas shows a
  // slightly stale image instead of going blank.
  const frameDisponivel = useCallback((frameIndex: number) => {
    const carregadas = carregadasRef.current;
    if (carregadas[frameIndex]) return frameIndex;

    for (let d = 1; d < TOTAL_FRAMES; d += 1) {
      const antes = frameIndex - d;
      if (antes >= 0 && carregadas[antes]) return antes;
      const depois = frameIndex + d;
      if (depois < TOTAL_FRAMES && carregadas[depois]) return depois;
    }
    return -1;
  }, []);

  const drawFrame = useCallback(
    (frameIndex: number) => {
      const canvas = canvasRef.current;
      const alvo = frameDisponivel(frameIndex);
      if (alvo < 0) return;

      const img = imagesRef.current[alvo];
      if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canvasRatio = canvasWidth / canvasHeight;

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      const isNarrow = canvasRatio < imgRatio * NARROW_RATIO_FACTOR;

      if (!isNarrow) {
        // Standard object-fit: cover — the viewport is wide/landscape
        // enough that filling the frame doesn't require an extreme zoom.
        const scale = Math.max(
          canvasWidth / img.naturalWidth,
          canvasHeight / img.naturalHeight
        );
        const drawWidth = img.naturalWidth * scale;
        const drawHeight = img.naturalHeight * scale;
        const offsetX = (canvasWidth - drawWidth) / 2;
        const offsetY = (canvasHeight - drawHeight) * focalY;

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        return;
      }

      // Narrow / portrait viewport: fit the frame to the screen WIDTH so
      // the whole car stays visible (no side crop), then fill the leftover
      // vertical space with a blurred, dimmed, full-bleed copy of the same
      // frame instead of stretching or over-zooming.
      const bgScale = Math.max(
        canvasWidth / img.naturalWidth,
        canvasHeight / img.naturalHeight
      );
      const bgWidth = img.naturalWidth * bgScale;
      const bgHeight = img.naturalHeight * bgScale;
      const bgOffsetX = (canvasWidth - bgWidth) / 2;
      const bgOffsetY = (canvasHeight - bgHeight) * focalY;

      ctx.save();
      ctx.filter = "blur(28px) brightness(0.55)";
      ctx.drawImage(img, bgOffsetX, bgOffsetY, bgWidth, bgHeight);
      ctx.restore();

      const drawWidth = canvasWidth;
      const drawHeight = img.naturalHeight * (canvasWidth / img.naturalWidth);
      const offsetX = 0;
      const offsetY = (canvasHeight - drawHeight) * focalY;

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      // Feather the seams between the sharp foreground frame and the
      // blurred backdrop instead of leaving a hard edge.
      const fadeSize = Math.min(canvasHeight * 0.12, 140);

      if (offsetY > 0) {
        const topFade = ctx.createLinearGradient(
          0,
          offsetY,
          0,
          offsetY + fadeSize
        );
        topFade.addColorStop(0, "rgba(0,0,0,0.85)");
        topFade.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = topFade;
        ctx.fillRect(offsetX, offsetY, drawWidth, fadeSize);
      }

      const bottomGapStart = offsetY + drawHeight;
      if (bottomGapStart < canvasHeight) {
        const bottomFade = ctx.createLinearGradient(
          0,
          bottomGapStart - fadeSize,
          0,
          bottomGapStart
        );
        bottomFade.addColorStop(0, "rgba(0,0,0,0)");
        bottomFade.addColorStop(1, "rgba(0,0,0,0.85)");
        ctx.fillStyle = bottomFade;
        ctx.fillRect(offsetX, bottomGapStart - fadeSize, drawWidth, fadeSize);
      }
    },
    [focalY, frameDisponivel]
  );

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

  // Load the opening batch, unlock the hero, then keep streaming the
  // rest in the background. Firing all 300 requests at once only made
  // them queue behind each other, so nothing was usable until the very
  // last one landed.
  useEffect(() => {
    let cancelled = false;

    const images: HTMLImageElement[] = new Array(TOTAL_FRAMES);
    const carregadas: boolean[] = new Array(TOTAL_FRAMES).fill(false);
    imagesRef.current = images;
    carregadasRef.current = carregadas;

    const carregar = (i: number) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        const pronto = () => {
          carregadas[i] = true;
          resolve();
        };
        img.onload = pronto;
        // A broken frame must not stall the sequence; it just stays
        // unavailable and the nearest neighbour covers for it.
        img.onerror = () => resolve();
        img.src = framePath(i + 1);
        images[i] = img;
      });

    (async () => {
      let feitas = 0;
      await Promise.all(
        Array.from({ length: LOTE_INICIAL }, (_, i) =>
          carregar(i).then(() => {
            if (cancelled) return;
            feitas += 1;
            setLoadProgress(Math.round((feitas / LOTE_INICIAL) * 100));
          })
        )
      );

      if (cancelled) return;
      setIsReady(true);

      for (let inicio = LOTE_INICIAL; inicio < TOTAL_FRAMES; inicio += LOTE_FUNDO) {
        if (cancelled) return;
        const tamanho = Math.min(LOTE_FUNDO, TOTAL_FRAMES - inicio);
        await Promise.all(
          Array.from({ length: tamanho }, (_, k) => carregar(inicio + k))
        );
      }
    })();

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
    if (!isReady) return;

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
  }, [isReady, updateFrameFromScroll]);

  return (
    <section ref={sectionRef} className="relative h-[400vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-black">
        <canvas ref={canvasRef} aria-hidden="true" className="h-full w-full" />

        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/20 to-black/50" />

        <motion.div
          style={{ y: overlayY, opacity: overlayOpacity }}
          className="absolute inset-0 z-20 flex items-center justify-center px-6"
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={isReady ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
            className="flex max-w-3xl flex-col items-center gap-4 text-center sm:gap-6"
          >
            <h1 className="font-display text-3xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">
              Encontre seu próximo carro na Alvorada Veículos
            </h1>
            <p className="text-sm text-white/80 sm:text-lg">
              Veículos revisados, procedência garantida e condições facilitadas
              para você sair dirigindo hoje.
            </p>
            <MotionLink
              href="/veiculos"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
              className="rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-gold-400 sm:px-8 sm:py-3"
            >
              Ver estoque completo
            </MotionLink>
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {!isReady && <HeroLoader key="loader" progresso={loadProgress} />}
        </AnimatePresence>
      </div>
    </section>
  );
}
