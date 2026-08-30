import Link from "next/link";
import { getAdminVeiculos } from "@/lib/admin-veiculos";
import VeiculosTable from "@/components/admin/VeiculosTable";
import EmptyVeiculos from "@/components/admin/EmptyVeiculos";
import Breadcrumb from "@/components/admin/Breadcrumb";

export default async function AdminVeiculosPage() {
  const veiculos = await getAdminVeiculos();

  return (
    <div>
      <Breadcrumb
        trilha={[{ label: "Dashboard", href: "/admin" }, { label: "Veículos" }]}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
            Veículos
          </h1>
          <p className="mt-1 text-sm text-white/50">
            {veiculos.length}{" "}
            {veiculos.length === 1 ? "veículo cadastrado" : "veículos cadastrados"}
          </p>
        </div>

        {veiculos.length > 0 && (
          <Link
            href="/admin/veiculos/novo"
            className="rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-gold-400"
          >
            + Cadastrar
          </Link>
        )}
      </div>

      {veiculos.length === 0 ? (
        <EmptyVeiculos />
      ) : (
        <VeiculosTable veiculos={veiculos} />
      )}
    </div>
  );
}
