"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import type { Veiculo } from "@/data/veiculos-mock";
import { formatKm, formatPrice } from "@/lib/format";
import VeiculoCard from "./VeiculoCard";
import RevealOnScroll from "./RevealOnScroll";
import SpecRow from "./SpecRow";
import {
  CalendarIcon,
  GaugeIcon,
  FuelIcon,
  GearboxIcon,
  PaintIcon,
  CheckIcon,
} from "./icons";

const WHATSAPP_NUMBER = "5511999999999";

const SELO_ITENS = [
  "Revisado",
  "Documentação em dia",
  "Km confere",
  "Sem sinistro",
];

const DESTAQUES_LABELS = ["Frente", "Lateral", "Traseira", "Interior"];

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

  const showcaseFotos = veiculo.fotos.slice(1, 3);

  return (
    <>
      <RevealOnScroll>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
          Ficha do veículo
        </p>
        <h1 className="mt-2 break-words font-display text-4xl font-black uppercase leading-[0.9] tracking-tight text-white sm:text-6xl md:text-7xl lg:text-8xl">
          {veiculo.marca}
        </h1>
        <p className="mt-3 font-display text-xl font-medium text-gold-400 sm:text-2xl">
          {veiculo.modelo}
        </p>
      </RevealOnScroll>

      <RevealOnScroll className="mt-10">
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

            {showcaseFotos.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-4">
                {showcaseFotos.map((foto, index) => (
                  <div
                    key={foto + index}
                    className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-neutral-900"
                  >
                    <Image
                      src={foto}
                      alt={`${veiculo.marca} ${veiculo.modelo} - ângulo adicional`}
                      fill
                      sizes="(min-width: 1024px) 30vw, 50vw"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="font-display text-4xl font-bold text-white">
              {formatPrice(veiculo.preco)}
            </p>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Ficha técnica
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SpecRow
                  icon={<CalendarIcon className="h-5 w-5" />}
                  label="Ano"
                  value={String(veiculo.ano)}
                />
                <SpecRow
                  icon={<GaugeIcon className="h-5 w-5" />}
                  label="Quilometragem"
                  value={formatKm(veiculo.km)}
                />
                <SpecRow
                  icon={<FuelIcon className="h-5 w-5" />}
                  label="Combustível"
                  value={veiculo.combustivel}
                />
                <SpecRow
                  icon={<GearboxIcon className="h-5 w-5" />}
                  label="Câmbio"
                  value={veiculo.cambio}
                />
                <SpecRow
                  icon={<PaintIcon className="h-5 w-5" />}
                  label="Cor"
                  value={veiculo.cor}
                />
              </div>
            </div>

            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Selo de Confiança Alvorada
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {SELO_ITENS.map((item) => (
                  <SpecRow
                    key={item}
                    icon={<CheckIcon className="h-5 w-5" />}
                    label={item}
                  />
                ))}
              </div>
            </div>

            {isVendido ? (
              <button
                disabled
                className="mt-8 w-full cursor-not-allowed rounded-full bg-neutral-800 px-6 py-4 text-sm font-semibold text-white/40"
              >
                Este veículo já foi vendido
              </button>
            ) : (
              <>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 flex w-full items-center justify-center rounded-full bg-gold-500 px-6 py-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-gold-400"
                >
                  Tenho interesse — Falar no WhatsApp
                </a>
                <p className="mt-3 text-center text-xs text-white/40">
                  Atendimento rápido, sem compromisso.
                </p>
              </>
            )}
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll className="mt-16">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
          Destaques do veículo
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DESTAQUES_LABELS.map((label, index) => (
            <div key={label} className="group relative overflow-hidden">
              <div
                className="relative aspect-[3/4] overflow-hidden bg-neutral-900"
                style={{
                  clipPath: "polygon(0 0, 100% 0, 100% 92%, 0 100%)",
                }}
              >
                <Image
                  src={veiculo.fotos[index % veiculo.fotos.length]}
                  alt={`${veiculo.marca} ${veiculo.modelo} - ${label}`}
                  fill
                  sizes="(min-width: 640px) 25vw, 50vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              </div>
              <div className="absolute bottom-4 left-3">
                <span className="font-display text-2xl font-bold text-gold-400/50">
                  0{index + 1}
                </span>
                <p className="text-sm font-medium text-white">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </RevealOnScroll>

      {similares.length > 0 && (
        <RevealOnScroll className="mt-20">
          <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
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
