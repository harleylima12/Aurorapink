"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Veiculo } from "@/lib/types";
import { formatKm, formatPrice } from "@/lib/format";
import { EASE_OUT_EXPO } from "@/lib/motion";
import CountUp from "./CountUp";

export default function VeiculoCard({ veiculo }: { veiculo: Veiculo }) {
  const router = useRouter();
  const [isLeaving, setIsLeaving] = useState(false);
  const isVendido = veiculo.status === "vendido";
  const href = `/veiculos/${veiculo.id}`;

  const handleClick = (event: React.MouseEvent) => {
    if (isLeaving) return;
    event.preventDefault();
    setIsLeaving(true);
    window.setTimeout(() => router.push(href), 180);
  };

  return (
    <Link href={href} onClick={handleClick} className="block">
      <motion.div
        initial={false}
        animate={
          isLeaving
            ? { opacity: 0, scale: 0.96 }
            : { opacity: 1, scale: 1 }
        }
        whileHover={{ y: -6 }}
        transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
        className="group overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-transparent transition-shadow duration-300 ease-out hover:shadow-[0_20px_45px_-15px_rgba(217,167,59,0.4)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-neutral-950">
          <Image
            src={veiculo.fotos[0]?.url ?? "/hero-frames/frame-001.jpg"}
            alt={`${veiculo.marca} ${veiculo.modelo}`}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />

          {veiculo.destaque && (
            <span className="absolute left-3 top-3 rounded-full bg-gold-500 px-3 py-1 text-xs font-semibold text-neutral-950">
              Destaque da semana
            </span>
          )}

          {isVendido && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55">
              <span className="-rotate-6 border-2 border-white px-4 py-1 text-sm font-bold uppercase tracking-[0.3em] text-white">
                Vendido
              </span>
            </div>
          )}
        </div>

        <div className={`p-5 ${isVendido ? "opacity-60" : ""}`}>
          <p className="text-xs uppercase tracking-wide text-white/50">
            {veiculo.marca}
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-gold-400">
            {veiculo.modelo}
          </h3>
          <p className="mt-2 text-sm text-white/60">
            {veiculo.ano} · {formatKm(veiculo.km)}
          </p>
          <CountUp
            value={veiculo.preco}
            format={formatPrice}
            className="mt-3 block font-display text-xl font-bold text-white"
          />
        </div>
      </motion.div>
    </Link>
  );
}
