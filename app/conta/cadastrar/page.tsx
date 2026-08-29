"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { tryCreateClient } from "@/lib/supabase-browser";
import { EASE_OUT_EXPO } from "@/lib/motion";

export default function CadastrarPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const supabase = tryCreateClient();

    if (!supabase) {
      setError(
        "Serviço indisponível no momento. Tente novamente em instantes."
      );
      setLoading(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome } },
    });

    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? "Este e-mail já está cadastrado."
          : "Não foi possível criar sua conta. Tente novamente."
      );
      setLoading(false);
      return;
    }

    // If email confirmation is required, Supabase returns a user but no
    // session yet — nothing to redirect into until they confirm.
    if (!data.session) {
      setInfo("Cadastro criado! Verifique seu e-mail para confirmar a conta.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-bold text-white">
            Criar nova conta
          </p>
          <p className="mt-1 text-sm text-white/50">
            Leva menos de um minuto.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-8"
        >
          <div>
            <label
              htmlFor="nome"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/50"
            >
              Nome
            </label>
            <input
              id="nome"
              type="text"
              autoComplete="name"
              required
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Seu nome"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>

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
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-lg border border-emerald-900/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
              {info}
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
            {loading ? "Criando conta..." : "Cadastrar"}
          </motion.button>

          <p className="text-center text-sm text-white/60">
            Já possui cadastro?{" "}
            <Link
              href="/conta/entrar"
              className="font-semibold text-gold-400 hover:text-gold-300"
            >
              Entrar
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
