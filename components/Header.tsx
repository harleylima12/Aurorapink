"use client";

import Link from "next/link";

const navLinks = [
  { href: "/", label: "Início" },
  { href: "/veiculos", label: "Veículos" },
  { href: "/contato", label: "Contato" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="font-display text-xl font-bold tracking-tight text-white"
        >
          Alvorada Veículos
        </Link>

        <nav>
          <ul className="flex items-center gap-8 text-sm font-medium text-white/70">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="transition-colors hover:text-gold-400"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
