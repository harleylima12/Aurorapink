import Link from "next/link";
import { notFound } from "next/navigation";
import { getVeiculoById, getVeiculosSimilares } from "@/lib/supabase";
import VeiculoDetail from "@/components/VeiculoDetail";

export default async function VeiculoDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const veiculo = await getVeiculoById(params.id);

  if (!veiculo) {
    notFound();
  }

  const similares = await getVeiculosSimilares(veiculo);

  return (
    <div className="bg-neutral-950 px-6 py-10 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <nav className="mb-8 flex flex-wrap items-center gap-2 text-sm text-white/50">
          <Link href="/" className="hover:text-gold-400">
            Início
          </Link>
          <span>/</span>
          <Link href="/veiculos" className="hover:text-gold-400">
            Veículos
          </Link>
          <span>/</span>
          <span className="text-white/80">
            {veiculo.marca} {veiculo.modelo}
          </span>
        </nav>

        <VeiculoDetail veiculo={veiculo} similares={similares} />
      </div>
    </div>
  );
}
