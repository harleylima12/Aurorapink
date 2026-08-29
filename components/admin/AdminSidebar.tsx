"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { tryCreateClient } from "@/lib/supabase-browser";
import { EASE_OUT_EXPO } from "@/lib/motion";
import {
  GridIcon,
  CarIcon,
  PlusIcon,
  LogoutIcon,
  MenuIcon,
  CloseIcon,
} from "@/components/icons";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: GridIcon },
  { href: "/admin/veiculos", label: "Veículos", icon: CarIcon },
  { href: "/admin/veiculos/novo", label: "Cadastrar novo", icon: PlusIcon },
];

function Wordmark() {
  return (
    <span className="font-display text-lg font-bold text-white">
      Alvorada <span className="text-gold-400">Admin</span>
    </span>
  );
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-gold-500/10 text-gold-400"
                : "text-white/60 hover:bg-neutral-800 hover:text-white"
            }`}
          >
            <Icon className="h-[18px] w-[18px] flex-shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = tryCreateClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={
        className ??
        "mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-neutral-800 hover:text-white"
      }
    >
      <LogoutIcon className="h-[18px] w-[18px] flex-shrink-0" />
      Sair
    </button>
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 px-4 py-6 lg:flex">
        <Link href="/admin" className="mb-8 px-2">
          <Wordmark />
        </Link>
        <NavLinks pathname={pathname} />
        <LogoutButton />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-3 lg:hidden">
        <Link href="/admin">
          <Wordmark />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="rounded-lg p-2 text-white/70 hover:bg-neutral-800 hover:text-white"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/70 lg:hidden"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col border-r border-neutral-800 bg-neutral-900 px-4 py-6 lg:hidden"
            >
              <div className="mb-8 flex items-center justify-between px-2">
                <Wordmark />
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Fechar menu"
                  className="text-white/60 hover:text-white"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
              <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
              <LogoutButton />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
