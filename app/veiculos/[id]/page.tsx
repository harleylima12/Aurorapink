import Link from "next/link";
import { notFound } from "next/navigation";
import { veiculosMock } from "@/data/veiculos-mock";
import VeiculoDetail from "@/components/VeiculoDetail";

export function generateStaticParams() {
  return veiculosMock.map((veiculo) => ({ id: veiculo.id }));
}

export default function VeiculoDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const veiculo = veiculosMock.find((item) => item.id === params.id);

  if (!veiculo) {
    notFound();
  }

  const similares = veiculosMock
    .filter((item) => item.id !== veiculo.id)
    .slice(0, 3);

  return (
    <div className="bg-neutral-950 px-6 py-10 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <nav className="mb-8 flex flex-wrap items-center gap-2 text-sm text-white/50">
          <Link href="/" className="hover:text-white">
            Início
          </Link>
          <span>/</span>
          <Link href="/veiculos" className="hover:text-white">
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
