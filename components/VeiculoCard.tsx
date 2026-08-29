import Image from "next/image";
import Link from "next/link";
import type { Veiculo } from "@/data/veiculos-mock";
import { formatKm, formatPrice } from "@/lib/format";

export default function VeiculoCard({ veiculo }: { veiculo: Veiculo }) {
  const isVendido = veiculo.status === "vendido";

  return (
    <Link
      href={`/veiculos/${veiculo.id}`}
      className="group block overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 transition-shadow duration-300 hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.25)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-950">
        <Image
          src={veiculo.fotos[0]}
          alt={`${veiculo.marca} ${veiculo.modelo}`}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {veiculo.destaque && (
          <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-900">
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
        <h3 className="mt-1 text-lg font-semibold text-white">
          {veiculo.modelo}
        </h3>
        <p className="mt-2 text-sm text-white/60">
          {veiculo.ano} · {formatKm(veiculo.km)}
        </p>
        <p className="mt-3 text-xl font-bold text-white">
          {formatPrice(veiculo.preco)}
        </p>
      </div>
    </Link>
  );
}
