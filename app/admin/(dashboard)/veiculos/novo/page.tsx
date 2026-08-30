import VeiculoForm from "@/components/admin/VeiculoForm";
import Breadcrumb from "@/components/admin/Breadcrumb";

export default function NovoVeiculoPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb
        trilha={[
          { label: "Dashboard", href: "/admin" },
          { label: "Veículos", href: "/admin/veiculos" },
          { label: "Cadastrar novo" },
        ]}
      />

      <h1 className="mb-1 font-display text-2xl font-bold text-white sm:text-3xl">
        Cadastrar novo veículo
      </h1>
      <p className="mb-8 text-sm text-white/50">
        Preencha os dados e adicione as fotos do veículo.
      </p>

      <VeiculoForm />
    </div>
  );
}
