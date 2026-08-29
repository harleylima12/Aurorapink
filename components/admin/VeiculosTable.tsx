"use client";

import { useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { EditIcon, ToggleIcon, TrashIcon } from "@/components/icons";
import { toggleVeiculoStatus, deleteVeiculo } from "@/app/admin/(dashboard)/actions";
import type { AdminVeiculoRow } from "@/lib/admin-veiculos";

function StatusBadge({ isVendido }: { isVendido: boolean }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
        isVendido
          ? "bg-neutral-700 text-neutral-300"
          : "bg-emerald-500/15 text-emerald-400"
      }`}
    >
      {isVendido ? "Vendido" : "Disponível"}
    </span>
  );
}

function VeiculoRow({ veiculo }: { veiculo: AdminVeiculoRow }) {
  const [isPending, startTransition] = useTransition();
  const isVendido = veiculo.status === "vendido";
  const nome = `${veiculo.marca} ${veiculo.modelo}`;

  const handleToggle = () => {
    const novoStatus = isVendido ? "disponivel" : "vendido";
    const confirmMsg = isVendido
      ? `Marcar "${nome}" como disponível novamente?`
      : `Marcar "${nome}" como vendido?`;
    if (!window.confirm(confirmMsg)) return;
    startTransition(() => {
      toggleVeiculoStatus(veiculo.id, novoStatus);
    });
  };

  const handleDelete = () => {
    const ok = window.confirm(
      `Excluir "${nome}" permanentemente? Essa ação não pode ser desfeita.`
    );
    if (!ok) return;
    startTransition(() => {
      deleteVeiculo(veiculo.id);
    });
  };

  return (
    <tr
      className={
        isPending ? "opacity-50 transition-opacity" : "transition-opacity"
      }
    >
      <td className="py-2.5 pl-4 pr-3">
        <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-800">
          <Image
            src={veiculo.foto ?? "/hero-frames/frame-001.jpg"}
            alt=""
            fill
            sizes="44px"
            className="object-cover"
          />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <p className="text-xs text-white/50">{veiculo.marca}</p>
        <p className="text-sm font-medium text-white">{veiculo.modelo}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-sm font-medium text-white">
        {formatPrice(veiculo.preco)}
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge isVendido={isVendido} />
      </td>
      <td className="py-2.5 pl-3 pr-4">
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/admin/veiculos/${veiculo.id}/editar`}
            title="Editar"
            aria-label="Editar"
            className="rounded-lg p-2 text-white/60 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            <EditIcon className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            title={isVendido ? "Marcar como disponível" : "Marcar como vendido"}
            aria-label={
              isVendido ? "Marcar como disponível" : "Marcar como vendido"
            }
            className="rounded-lg p-2 text-white/60 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-40"
          >
            <ToggleIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            title="Excluir"
            aria-label="Excluir"
            className="rounded-lg p-2 text-white/60 transition-colors hover:bg-red-950 hover:text-red-400 disabled:opacity-40"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function VeiculosTable({
  veiculos,
}: {
  veiculos: AdminVeiculoRow[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-800">
      <table className="w-full min-w-[560px] text-left">
        <thead className="border-b border-neutral-800 bg-neutral-900 text-xs uppercase tracking-wide text-white/50">
          <tr>
            <th className="py-3 pl-4 pr-3 font-medium">Foto</th>
            <th className="px-3 py-3 font-medium">Veículo</th>
            <th className="px-3 py-3 font-medium">Preço</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="py-3 pl-3 pr-4 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {veiculos.map((veiculo) => (
            <VeiculoRow key={veiculo.id} veiculo={veiculo} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
