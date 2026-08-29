"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-browser";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { UserIcon } from "./icons";

export default function AccountMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Minha conta"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/5 hover:text-white"
      >
        <UserIcon className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
            className="absolute right-0 mt-3 w-72 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl"
          >
            {user ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-white/50">
                  Logado como
                </p>
                <p className="mt-1 truncate text-sm font-medium text-white">
                  {user.email}
                </p>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-4 w-full rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                >
                  Sair
                </button>
              </div>
            ) : (
              <div className="text-center">
                <p className="font-display text-sm font-semibold text-white">
                  Já possui cadastro?
                  <br />
                  Acesse sua conta
                </p>
                <Link
                  href="/conta/entrar"
                  onClick={() => setOpen(false)}
                  className="mt-4 flex w-full items-center justify-center rounded-full bg-gold-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-gold-400"
                >
                  Entrar
                </Link>
                <p className="mt-4 text-sm text-white/60">
                  Cliente novo?{" "}
                  <Link
                    href="/conta/cadastrar"
                    onClick={() => setOpen(false)}
                    className="font-semibold text-gold-400 hover:text-gold-300"
                  >
                    Cadastrar
                  </Link>
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
