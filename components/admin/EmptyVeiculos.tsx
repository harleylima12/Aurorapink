import Link from "next/link";

export default function EmptyVeiculos() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 px-8 py-16 text-center">
      <p className="font-display text-xl font-semibold text-white">
        Nenhum veículo cadastrado ainda
      </p>
      <p className="mt-2 max-w-sm text-sm text-white/60">
        Cadastre o primeiro veículo do estoque para começar a preencher sua
        vitrine.
      </p>
      <Link
        href="/admin/veiculos/novo"
        className="mt-6 rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-gold-400"
      >
        Cadastrar primeiro veículo
      </Link>
    </div>
  );
}
