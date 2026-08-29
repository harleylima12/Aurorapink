"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase-browser";
import { EASE_OUT_EXPO } from "@/lib/motion";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.user) {
      setError("E-mail ou senha incorretos.");
      setLoading(false);
      return;
    }

    const { data: perfil, error: perfilError } = await supabase
      .from("perfis")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (perfilError || perfil?.role !== "admin") {
      await supabase.auth.signOut();
      setError("Esta conta não tem acesso ao painel administrativo.");
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-bold text-white">
            Alvorada Veículos
          </p>
          <p className="mt-1 text-sm text-white/50">Painel administrativo</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-8"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/50"
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@email.com"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/50"
            >
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={loading ? undefined : { scale: 1.02 }}
            whileTap={loading ? undefined : { scale: 0.98 }}
            transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
            className="flex w-full items-center justify-center rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
