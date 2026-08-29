"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { veiculosMock } from "@/data/veiculos-mock";
import VeiculoCard from "./VeiculoCard";
import RevealOnScroll from "./RevealOnScroll";

type SortBy = "recente" | "menor" | "maior";

const FAIXAS_PRECO = [
  { id: "ate-80k", label: "Até R$ 80.000", min: 0, max: 80000 },
  { id: "80k-120k", label: "R$ 80.000 – R$ 120.000", min: 80000, max: 120000 },
  { id: "120k-180k", label: "R$ 120.000 – R$ 180.000", min: 120000, max: 180000 },
  { id: "acima-180k", label: "Acima de R$ 180.000", min: 180000, max: Infinity },
] as const;

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

interface FiltersPanelProps {
  marcas: string[];
  selectedMarcas: string[];
  onToggleMarca: (marca: string) => void;
  selectedFaixas: string[];
  onToggleFaixa: (id: string) => void;
  onClear: () => void;
}

function FiltersPanel({
  marcas,
  selectedMarcas,
  onToggleMarca,
  selectedFaixas,
  onToggleFaixa,
  onClear,
}: FiltersPanelProps) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
          Filtros
        </h3>
        <button
          onClick={onClear}
          className="text-xs text-white/50 underline-offset-2 hover:text-white hover:underline"
        >
          Limpar
        </button>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
          Faixa de preço
        </p>
        <ul className="mt-3 space-y-2">
          {FAIXAS_PRECO.map((faixa) => (
            <li key={faixa.id}>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-white"
                  checked={selectedFaixas.includes(faixa.id)}
                  onChange={() => onToggleFaixa(faixa.id)}
                />
                {faixa.label}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
          Marca
        </p>
        <ul className="mt-3 space-y-2">
          {marcas.map((marca) => (
            <li key={marca}>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-white"
                  checked={selectedMarcas.includes(marca)}
                  onChange={() => onToggleMarca(marca)}
                />
                {marca}
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function EstoqueSection() {
  const [selectedMarcas, setSelectedMarcas] = useState<string[]>([]);
  const [selectedFaixas, setSelectedFaixas] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>("recente");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const marcas = useMemo(
    () => Array.from(new Set(veiculosMock.map((v) => v.marca))).sort(),
    []
  );

  const veiculosFiltrados = useMemo(() => {
    const filtrados = veiculosMock.filter((veiculo) => {
      const marcaOk =
        selectedMarcas.length === 0 || selectedMarcas.includes(veiculo.marca);

      const faixaOk =
        selectedFaixas.length === 0 ||
        selectedFaixas.some((id) => {
          const faixa = FAIXAS_PRECO.find((f) => f.id === id);
          return (
            !!faixa && veiculo.preco >= faixa.min && veiculo.preco < faixa.max
          );
        });

      return marcaOk && faixaOk;
    });

    return [...filtrados].sort((a, b) => {
      if (sortBy === "menor") return a.preco - b.preco;
      if (sortBy === "maior") return b.preco - a.preco;
      return b.ano - a.ano;
    });
  }, [selectedMarcas, selectedFaixas, sortBy]);

  const toggleMarca = (marca: string) =>
    setSelectedMarcas((prev) => toggleValue(prev, marca));
  const toggleFaixa = (id: string) =>
    setSelectedFaixas((prev) => toggleValue(prev, id));
  const clearFilters = () => {
    setSelectedMarcas([]);
    setSelectedFaixas([]);
  };

  return (
    <section id="estoque" className="bg-neutral-950 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <RevealOnScroll>
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Nosso Estoque
            </h2>
            <p className="mt-3 text-white/60">
              Veículos revisados e com procedência garantida, prontos para
              você sair dirigindo hoje mesmo.
            </p>
          </div>
        </RevealOnScroll>

        <div className="mb-6 lg:hidden">
          <button
            onClick={() => setMobileFiltersOpen(true)}
            className="rounded-full border border-neutral-700 px-5 py-2 text-sm font-medium text-white"
          >
            Filtros
          </button>
        </div>

        <div className="flex flex-col gap-10 lg:flex-row">
          <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0">
            <div className="sticky top-24">
              <FiltersPanel
                marcas={marcas}
                selectedMarcas={selectedMarcas}
                onToggleMarca={toggleMarca}
                selectedFaixas={selectedFaixas}
                onToggleFaixa={toggleFaixa}
                onClear={clearFilters}
              />
            </div>
          </aside>

          <div className="flex-1">
            <div className="mb-6 flex items-center justify-between gap-4">
              <p className="text-sm text-white/50">
                {veiculosFiltrados.length}{" "}
                {veiculosFiltrados.length === 1
                  ? "veículo encontrado"
                  : "veículos encontrados"}
              </p>

              <label className="flex items-center gap-2 text-sm text-white/70">
                <span className="hidden sm:inline">Ordenar por</span>
                <select
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(event.target.value as SortBy)
                  }
                  className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-white focus:outline-none"
                >
                  <option value="recente">Mais recente</option>
                  <option value="menor">Menor preço</option>
                  <option value="maior">Maior preço</option>
                </select>
              </label>
            </div>

            {veiculosFiltrados.length === 0 ? (
              <p className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center text-white/60">
                Nenhum veículo encontrado com esses filtros.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {veiculosFiltrados.map((veiculo, index) => (
                  <RevealOnScroll key={veiculo.id} delay={(index % 6) * 0.08}>
                    <VeiculoCard veiculo={veiculo} />
                  </RevealOnScroll>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {mobileFiltersOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileFiltersOpen(false)}
              className="fixed inset-0 z-40 bg-black/70 lg:hidden"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] overflow-y-auto bg-neutral-900 p-6 lg:hidden"
            >
              <div className="mb-6 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">
                  Filtrar veículos
                </span>
                <button
                  onClick={() => setMobileFiltersOpen(false)}
                  aria-label="Fechar filtros"
                  className="text-white/60 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <FiltersPanel
                marcas={marcas}
                selectedMarcas={selectedMarcas}
                onToggleMarca={toggleMarca}
                selectedFaixas={selectedFaixas}
                onToggleFaixa={toggleFaixa}
                onClear={clearFilters}
              />
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="mt-8 w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-neutral-900"
              >
                Ver {veiculosFiltrados.length} veículo
                {veiculosFiltrados.length === 1 ? "" : "s"}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </section>
  );
}
