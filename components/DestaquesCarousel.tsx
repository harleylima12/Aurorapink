"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type { Veiculo } from "@/lib/types";
import { formatKm, formatPrice } from "@/lib/format";
import { EASE_OUT_EXPO } from "@/lib/motion";
import RevealOnScroll from "./RevealOnScroll";

const FOTO_FALLBACK = "/hero-frames/frame-001.jpg";
const INTERVALO_AUTOPLAY = 5500;

/** Where each card sits relative to the one in front. */
function posicao(rel: number) {
  const lado = Math.sign(rel);
  const distancia = Math.abs(rel);

  if (distancia === 0) {
    return { x: "0%", scale: 1, rotateY: 0, opacity: 1, zIndex: 30 };
  }
  if (distancia === 1) {
    return {
      x: `${lado * 62}%`,
      scale: 0.78,
      rotateY: lado * -24,
      opacity: 0.5,
      zIndex: 20,
    };
  }
  return {
    x: `${lado * 104}%`,
    scale: 0.62,
    rotateY: lado * -30,
    opacity: 0.18,
    zIndex: 10,
  };
}

export default function DestaquesCarousel({
  veiculos,
}: {
  veiculos: Veiculo[];
}) {
  const destaques = veiculos.filter((v) => v.destaque);
  const total = destaques.length;

  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const irPara = useCallback(
    (proximo: number) => {
      if (total === 0) return;
      setIndice(((proximo % total) + total) % total);
    },
    [total]
  );

  const avancar = useCallback(() => irPara(indice + 1), [indice, irPara]);
  const voltar = useCallback(() => irPara(indice - 1), [indice, irPara]);

  // Autoplay, held while the pointer is over the carousel or focus is
  // inside it, and off entirely for reduced-motion users.
  useEffect(() => {
    if (total <= 1 || pausado) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const timer = setInterval(avancar, INTERVALO_AUTOPLAY);
    return () => clearInterval(timer);
  }, [avancar, pausado, total]);

  // Arrow keys drive the carousel while it holds focus.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        avancar();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        voltar();
      }
    };

    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [avancar, voltar]);

  if (total === 0) return null;

  const atual = destaques[indice];
  const capaAtual = atual.fotos[0]?.url ?? FOTO_FALLBACK;

  return (
    <section className="relative overflow-hidden bg-neutral-950 py-20 sm:py-28">
      {/* Backdrop: the current car's own photo, blurred down to a colour
          wash, so the section's gradient always belongs to what's on
          screen. Cheaper and CORS-safe compared to sampling pixels. */}
      <div aria-hidden="true" className="absolute inset-0">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={atual.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.32 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
            className="absolute inset-0"
          >
            <Image
              src={capaAtual}
              alt=""
              fill
              sizes="100vw"
              className="scale-125 object-cover blur-3xl"
              priority={false}
            />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-950 via-neutral-950/75 to-neutral-950" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        <RevealOnScroll>
          <div className="mb-12 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400/80">
              Seleção da semana
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">
              Carros em Destaque
            </h2>
            <p className="mt-3 text-white/60">
              Os veículos que a nossa equipe separou para você olhar primeiro.
            </p>
          </div>
        </RevealOnScroll>

        <div
          ref={containerRef}
          tabIndex={-1}
          role="region"
          aria-roledescription="carrossel"
          aria-label="Carros em destaque"
          onMouseEnter={() => setPausado(true)}
          onMouseLeave={() => setPausado(false)}
          onFocusCapture={() => setPausado(true)}
          onBlurCapture={() => setPausado(false)}
          className="relative outline-none"
        >
          <div
            className="relative mx-auto h-[380px] w-full max-w-md sm:h-[440px] sm:max-w-lg"
            style={{ perspective: "1400px" }}
          >
            {destaques.map((veiculo, i) => {
              // Shortest way round the ring, so wrapping never animates
              // the long way across the whole list.
              let rel = i - indice;
              if (rel > total / 2) rel -= total;
              if (rel < -total / 2) rel += total;
              if (Math.abs(rel) > 2) return null;

              const p = posicao(rel);
              const ehAtual = rel === 0;

              return (
                <motion.div
                  key={veiculo.id}
                  animate={p}
                  transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
                  drag={ehAtual ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.16}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -60) avancar();
                    else if (info.offset.x > 60) voltar();
                  }}
                  style={{ zIndex: p.zIndex }}
                  className="absolute inset-0"
                >
                  <CardDestaque
                    veiculo={veiculo}
                    ativo={ehAtual}
                    onSelecionar={() => irPara(i)}
                  />
                </motion.div>
              );
            })}
          </div>

          {total > 1 && (
            <>
              <div className="mt-8 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={voltar}
                  aria-label="Veículo anterior"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 text-white/70 transition-colors hover:border-gold-500 hover:text-gold-400"
                >
                  <Seta className="h-4 w-4 rotate-180" />
                </button>

                <div className="flex items-center gap-2">
                  {destaques.map((veiculo, i) => (
                    <button
                      key={veiculo.id}
                      type="button"
                      onClick={() => irPara(i)}
                      aria-label={`Ver ${veiculo.marca} ${veiculo.modelo}`}
                      aria-current={i === indice}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === indice
                          ? "w-7 bg-gold-500"
                          : "w-1.5 bg-white/25 hover:bg-white/50"
                      }`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={avancar}
                  aria-label="Próximo veículo"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 text-white/70 transition-colors hover:border-gold-500 hover:text-gold-400"
                >
                  <Seta className="h-4 w-4" />
                </button>
              </div>

              {/* Announced to screen readers without being visible. */}
              <p aria-live="polite" className="sr-only">
                {`${atual.marca} ${atual.modelo}, ${indice + 1} de ${total}`}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Seta({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CardDestaque({
  veiculo,
  ativo,
  onSelecionar,
}: {
  veiculo: Veiculo;
  ativo: boolean;
  onSelecionar: () => void;
}) {
  const capa = veiculo.fotos[0]?.url ?? FOTO_FALLBACK;
  const conteudo = (
    <>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-neutral-950">
        <Image
          src={capa}
          alt={`Foto de capa do ${veiculo.marca} ${veiculo.modelo} ${veiculo.ano}`}
          fill
          sizes="(min-width: 640px) 32rem, 90vw"
          className="object-cover"
          draggable={false}
        />
        <span className="absolute left-3 top-3 rounded-full bg-gold-500 px-3 py-1 text-xs font-semibold text-neutral-950">
          Destaque da semana
        </span>
        {veiculo.status === "vendido" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <span className="-rotate-6 border-2 border-white px-4 py-1 text-sm font-bold uppercase tracking-[0.3em] text-white">
              Vendido
            </span>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 p-5">
        <p className="text-xs uppercase tracking-wide text-white/50">
          {veiculo.marca}
        </p>
        <h3 className="mt-1 truncate font-display text-lg font-semibold text-gold-400">
          {veiculo.modelo}
        </h3>
        <p className="mt-2 text-sm text-white/60">
          {veiculo.ano} · {formatKm(veiculo.km)}
        </p>
        <p className="mt-3 font-display text-xl font-bold text-white">
          {formatPrice(veiculo.preco)}
        </p>
      </div>
    </>
  );

  const classe =
    "flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl";

  // Only the front card is a link; the ones behind it just bring
  // themselves forward, so a click never navigates unexpectedly.
  if (!ativo) {
    return (
      <button
        type="button"
        onClick={onSelecionar}
        tabIndex={-1}
        aria-hidden="true"
        className={`${classe} w-full cursor-pointer text-left`}
      >
        {conteudo}
      </button>
    );
  }

  return (
    <Link
      href={`/veiculos/${veiculo.id}`}
      draggable={false}
      className={`${classe} transition-shadow duration-300 hover:shadow-[0_25px_60px_-20px_rgba(217,167,59,0.5)]`}
    >
      {conteudo}
    </Link>
  );
}
