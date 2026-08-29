"use client";

import Link from "next/link";

const navLinks = [
  { href: "/", label: "Início" },
  { href: "/veiculos", label: "Veículos" },
  { href: "/contato", label: "Contato" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-neutral-900">
          Alvorada Veículos
        </Link>

        <nav>
          <ul className="flex items-center gap-8 text-sm font-medium text-neutral-700">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="transition-colors hover:text-neutral-900">
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
