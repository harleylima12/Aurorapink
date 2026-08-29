export default function Footer() {
  return (
    <footer className="w-full border-t border-neutral-800 bg-neutral-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-white/60 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-display font-semibold text-white">
            Alvorada Veículos
          </p>
          <p>Av. Placeholder, 1234 - Centro, Cidade - UF</p>
          <p>(00) 0000-0000</p>
        </div>

        <div>
          <p className="font-display font-semibold text-white">
            Redes sociais
          </p>
          <p>Instagram · Facebook · WhatsApp</p>
        </div>
      </div>

      <p className="border-t border-neutral-800 px-6 py-4 text-center text-xs text-white/40">
        © {new Date().getFullYear()} Alvorada Veículos. Todos os direitos
        reservados.
      </p>
    </footer>
  );
}
