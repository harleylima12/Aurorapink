"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import type { Veiculo } from "@/data/veiculos-mock";
import { formatKm, formatPrice } from "@/lib/format";
import VeiculoCard from "./VeiculoCard";
import RevealOnScroll from "./RevealOnScroll";

const WHATSAPP_NUMBER = "5511999999999";

const SELO_ITENS = [
  "Revisado",
  "Documentação em dia",
  "Km confere",
  "Sem sinistro",
];

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className="h-5 w-5 flex-shrink-0 text-white"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.5 10.2l2.3 2.3 4.7-4.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function VeiculoDetail({
  veiculo,
  similares,
}: {
  veiculo: Veiculo;
  similares: Veiculo[];
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const isVendido = veiculo.status === "vendido";

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Olá! Tenho interesse no ${veiculo.marca} ${veiculo.modelo} (${veiculo.ano}) anunciado na Alvorada Veículos.`
  )}`;

  return (
    <>
      <RevealOnScroll>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-neutral-900">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="absolute inset-0"
                >
                  <Image
                    src={veiculo.fotos[selectedIndex]}
                    alt={`${veiculo.marca} ${veiculo.modelo} - foto ${
                      selectedIndex + 1
                    }`}
                    fill
                    priority
                    sizes="(min-width: 1024px) 60vw, 100vw"
                    className="object-cover"
                  />
                </motion.div>
              </AnimatePresence>

              {isVendido && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55">
                  <span className="-rotate-6 border-2 border-white px-6 py-2 text-lg font-bold uppercase tracking-[0.3em] text-white">
                    Vendido
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
              {veiculo.fotos.map((foto, index) => (
                <button
                  key={foto + index}
                  onClick={() => setSelectedIndex(index)}
                  className={`relative aspect-[4/3] w-20 flex-shrink-0 overflow-hidden rounded-lg border-2 sm:w-24 ${
                    selectedIndex === index
                      ? "border-white"
                      : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                  aria-label={`Ver foto ${index + 1}`}
                >
                  <Image
                    src={foto}
                    alt=""
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm uppercase tracking-wide text-white/50">
              {veiculo.marca}
            </p>
            <h1 className="mt-1 text-3xl font-bold text-white sm:text-4xl">
              {veiculo.modelo}
            </h1>
            <p className="mt-4 text-3xl font-bold text-white">
              {formatPrice(veiculo.preco)}
            </p>

            <dl className="mt-8 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-neutral-800 pt-6 text-sm">
              <div>
                <dt className="text-white/50">Ano</dt>
                <dd className="mt-1 font-medium text-white">{veiculo.ano}</dd>
              </div>
              <div>
                <dt className="text-white/50">Quilometragem</dt>
                <dd className="mt-1 font-medium text-white">
                  {formatKm(veiculo.km)}
                </dd>
              </div>
              <div>
                <dt className="text-white/50">Combustível</dt>
                <dd className="mt-1 font-medium text-white">
                  {veiculo.combustivel}
                </dd>
              </div>
              <div>
                <dt className="text-white/50">Câmbio</dt>
                <dd className="mt-1 font-medium text-white">
                  {veiculo.cambio}
                </dd>
              </div>
              <div>
                <dt className="text-white/50">Cor</dt>
                <dd className="mt-1 font-medium text-white">{veiculo.cor}</dd>
              </div>
            </dl>

            <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-white">
                Selo de Confiança Alvorada
              </p>
              <ul className="mt-4 space-y-3">
                {SELO_ITENS.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 text-sm text-white/80"
                  >
                    <CheckIcon />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {isVendido ? (
              <button
                disabled
                className="mt-8 w-full cursor-not-allowed rounded-full bg-neutral-800 px-6 py-4 text-sm font-semibold text-white/40"
              >
                Este veículo já foi vendido
              </button>
            ) : (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 flex w-full items-center justify-center rounded-full bg-white px-6 py-4 text-sm font-semibold text-neutral-900 transition-colors hover:bg-white/90"
              >
                Tenho interesse — Falar no WhatsApp
              </a>
            )}
          </div>
        </div>
      </RevealOnScroll>

      {similares.length > 0 && (
        <RevealOnScroll className="mt-20">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Veículos similares
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {similares.map((similar, index) => (
              <RevealOnScroll key={similar.id} delay={index * 0.08}>
                <VeiculoCard veiculo={similar} />
              </RevealOnScroll>
            ))}
          </div>
        </RevealOnScroll>
      )}
    </>
  );
}
