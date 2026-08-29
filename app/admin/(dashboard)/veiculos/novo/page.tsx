import Link from "next/link";
import VeiculoForm from "@/components/admin/VeiculoForm";

export default function NovoVeiculoPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin"
        className="text-sm text-white/50 transition-colors hover:text-white"
      >
        ← Voltar ao dashboard
      </Link>

      <h1 className="mb-1 mt-4 font-display text-2xl font-bold text-white sm:text-3xl">
        Cadastrar novo veículo
      </h1>
      <p className="mb-8 text-sm text-white/50">
        Preencha os dados e adicione as fotos do veículo.
      </p>

      <VeiculoForm />
    </div>
  );
}
