"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { EASE_OUT_EXPO } from "@/lib/motion";
import AccountMenu from "./AccountMenu";
import Logo from "./Logo";

const navLinks = [
  { href: "/", label: "Início" },
  { href: "/veiculos", label: "Veículos" },
  { href: "/contato", label: "Contato" },
];

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The admin panel has its own sidebar/chrome — no public nav there.
  if (pathname?.startsWith("/admin")) return null;

  return (
    <motion.header
      initial={false}
      animate={{
        paddingTop: scrolled ? 10 : 20,
        paddingBottom: scrolled ? 10 : 20,
        backgroundColor: scrolled
          ? "rgba(10,10,10,0.85)"
          : "rgba(10,10,10,0)",
        borderBottomColor: scrolled
          ? "rgba(38,38,38,1)"
          : "rgba(38,38,38,0)",
      }}
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
      className="sticky top-0 z-50 w-full border-b backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Alvorada Veículos" className="min-w-0 shrink">
          <Logo className="h-10 w-auto sm:h-12" />
        </Link>

        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-6">
          <nav>
            <ul className="flex items-center gap-4 text-sm font-medium text-white/70 sm:gap-8">
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
          <AccountMenu />
        </div>
      </div>
    </motion.header>
  );
}
