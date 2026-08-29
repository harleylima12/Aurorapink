export default function Footer() {
  return (
    <footer className="w-full border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-neutral-600 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-neutral-900">Alvorada Veículos</p>
          <p>Av. Placeholder, 1234 - Centro, Cidade - UF</p>
          <p>(00) 0000-0000</p>
        </div>

        <div>
          <p className="font-semibold text-neutral-900">Redes sociais</p>
          <p>Instagram · Facebook · WhatsApp</p>
        </div>
      </div>

      <p className="border-t border-neutral-200 px-6 py-4 text-center text-xs text-neutral-400">
        © {new Date().getFullYear()} Alvorada Veículos. Todos os direitos reservados.
      </p>
    </footer>
  );
}
