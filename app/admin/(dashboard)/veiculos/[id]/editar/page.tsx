import Link from "next/link";
import { notFound } from "next/navigation";
import VeiculoForm from "@/components/admin/VeiculoForm";
import { getVeiculoById } from "@/lib/admin-veiculos";
import { currencyToInput, maskInteger } from "@/lib/veiculo-form";

export default async function EditarVeiculoPage({
  params,
}: {
  params: { id: string };
}) {
  const veiculo = await getVeiculoById(params.id);

  if (!veiculo) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin"
        className="text-sm text-white/50 transition-colors hover:text-white"
      >
        ← Voltar ao dashboard
      </Link>

      <h1 className="mb-1 mt-4 font-display text-2xl font-bold text-white sm:text-3xl">
        Editar veículo
      </h1>
      <p className="mb-8 text-sm text-white/50">
        {veiculo.marca} {veiculo.modelo}
      </p>

      <VeiculoForm
        veiculoId={veiculo.id}
        initialValues={{
          marca: veiculo.marca,
          modelo: veiculo.modelo,
          ano: String(veiculo.ano),
          km: maskInteger(String(veiculo.km)),
          preco: currencyToInput(veiculo.preco),
          combustivel: veiculo.combustivel,
          cambio: veiculo.cambio,
          cor: veiculo.cor,
          descricao: veiculo.descricao ?? "",
          destaque: veiculo.destaque,
        }}
        initialFotos={veiculo.fotos}
      />
    </div>
  );
}
