"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { EditIcon, ToggleIcon, TrashIcon } from "@/components/icons";
import { toggleVeiculoStatus, deleteVeiculo } from "@/app/admin/(dashboard)/actions";
import { useFeedback } from "@/components/ui/Feedback";
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
  const { toast, confirmar } = useFeedback();
  const isVendido = veiculo.status === "vendido";
  const nome = `${veiculo.marca} ${veiculo.modelo}`;

  const handleToggle = async () => {
    const novoStatus = isVendido ? "disponivel" : "vendido";
    const ok = await confirmar({
      titulo: isVendido ? "Marcar como disponível?" : "Marcar como vendido?",
      mensagem: isVendido
        ? `"${nome}" volta a aparecer na vitrine como disponível.`
        : `"${nome}" deixa de aceitar contato e passa a exibir a tarja de vendido.`,
      confirmar: isVendido ? "Marcar disponível" : "Marcar vendido",
    });
    if (!ok) return;

    startTransition(async () => {
      try {
        await toggleVeiculoStatus(veiculo.id, novoStatus);
        toast(
          isVendido
            ? `"${nome}" está disponível novamente.`
            : `"${nome}" foi marcado como vendido.`
        );
      } catch {
        toast("Não foi possível alterar o status. Tente novamente.", "erro");
      }
    });
  };

  const handleDelete = async () => {
    const ok = await confirmar({
      titulo: "Excluir veículo?",
      mensagem: `"${nome}" e todas as suas fotos serão removidos permanentemente. Essa ação não pode ser desfeita.`,
      destrutivo: true,
      confirmar: "Excluir",
    });
    if (!ok) return;

    startTransition(async () => {
      try {
        await deleteVeiculo(veiculo.id);
        toast(`"${nome}" foi excluído.`);
      } catch {
        toast("Não foi possível excluir o veículo. Tente novamente.", "erro");
      }
    });
  };

  return (
    <tr
      className={`transition-colors hover:bg-neutral-900/70 ${
        isPending ? "opacity-50" : ""
      }`}
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

type Coluna = "veiculo" | "preco" | "status";

function Cabecalho({
  coluna,
  label,
  ordem,
  onOrdenar,
  className,
}: {
  coluna: Coluna;
  label: string;
  ordem: { coluna: Coluna; asc: boolean };
  onOrdenar: (c: Coluna) => void;
  className?: string;
}) {
  const ativa = ordem.coluna === coluna;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onOrdenar(coluna)}
        aria-sort={ativa ? (ordem.asc ? "ascending" : "descending") : "none"}
        className={`flex items-center gap-1.5 font-medium uppercase tracking-wide transition-colors hover:text-white ${
          ativa ? "text-gold-400" : "text-white/50"
        }`}
      >
        {label}
        <span aria-hidden="true" className="text-[9px] leading-none">
          {ativa ? (ordem.asc ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

export default function VeiculosTable({
  veiculos,
}: {
  veiculos: AdminVeiculoRow[];
}) {
  const [ordem, setOrdem] = useState<{ coluna: Coluna; asc: boolean }>({
    coluna: "veiculo",
    asc: true,
  });

  const ordenados = useMemo(() => {
    const copia = [...veiculos];
    copia.sort((a, b) => {
      let r = 0;
      if (ordem.coluna === "preco") {
        r = a.preco - b.preco;
      } else if (ordem.coluna === "status") {
        r = a.status.localeCompare(b.status);
      } else {
        r = `${a.marca} ${a.modelo}`.localeCompare(`${b.marca} ${b.modelo}`, "pt-BR");
      }
      return ordem.asc ? r : -r;
    });
    return copia;
  }, [veiculos, ordem]);

  const ordenar = (coluna: Coluna) =>
    setOrdem((atual) =>
      atual.coluna === coluna
        ? { coluna, asc: !atual.asc }
        : { coluna, asc: true }
    );

  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-800">
      <table className="w-full min-w-[560px] text-left">
        <thead className="border-b border-neutral-800 bg-neutral-900 text-xs">
          <tr>
            <th className="py-3 pl-4 pr-3 font-medium uppercase tracking-wide text-white/50">
              Foto
            </th>
            <Cabecalho
              coluna="veiculo"
              label="Veículo"
              ordem={ordem}
              onOrdenar={ordenar}
              className="px-3 py-3"
            />
            <Cabecalho
              coluna="preco"
              label="Preço"
              ordem={ordem}
              onOrdenar={ordenar}
              className="px-3 py-3"
            />
            <Cabecalho
              coluna="status"
              label="Status"
              ordem={ordem}
              onOrdenar={ordenar}
              className="px-3 py-3"
            />
            <th className="py-3 pl-3 pr-4 text-right font-medium uppercase tracking-wide text-white/50">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {ordenados.map((veiculo) => (
            <VeiculoRow key={veiculo.id} veiculo={veiculo} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
