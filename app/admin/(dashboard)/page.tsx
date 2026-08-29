import { getAdminVeiculos } from "@/lib/admin-veiculos";
import StatCard from "@/components/admin/StatCard";
import VeiculosTable from "@/components/admin/VeiculosTable";
import EmptyVeiculos from "@/components/admin/EmptyVeiculos";
import SuccessBanner from "@/components/admin/SuccessBanner";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: { ok?: string };
}) {
  const veiculos = await getAdminVeiculos();
  const disponiveis = veiculos.filter((v) => v.status === "disponivel").length;
  const vendidos = veiculos.filter((v) => v.status === "vendido").length;

  return (
    <div>
      <SuccessBanner status={searchParams.ok} />

      <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
        Dashboard
      </h1>
      <p className="mt-1 text-sm text-white/50">
        Visão geral do estoque da Alvorada Veículos.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Disponíveis" value={disponiveis} />
        <StatCard label="Vendidos" value={vendidos} />
        <StatCard label="Total no estoque" value={veiculos.length} />
      </div>

      <div className="mt-10">
        <h2 className="mb-4 font-display text-lg font-semibold text-white">
          Veículos cadastrados
        </h2>
        {veiculos.length === 0 ? (
          <EmptyVeiculos />
        ) : (
          <VeiculosTable veiculos={veiculos} />
        )}
      </div>
    </div>
  );
}
