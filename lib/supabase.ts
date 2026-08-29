import { createClient } from "@supabase/supabase-js";
import type { Veiculo, VeiculoStatus } from "@/data/veiculos-mock";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Built lazily (not `createClient(url!, key!)` at module scope) so a
// deploy missing these env vars doesn't crash every page that imports
// this module — it just makes getVeiculos() report the same "nothing
// to show yet" state as an empty table instead of a 500.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

interface VeiculoFotoRow {
  url: string;
  ordem: number;
}

interface VeiculoRow {
  id: string;
  marca: string;
  modelo: string;
  ano: number;
  km: number;
  preco: number;
  combustivel: string;
  cambio: string;
  cor: string;
  status: VeiculoStatus;
  destaque: boolean;
  veiculo_fotos: VeiculoFotoRow[] | null;
}

/**
 * Fetches every vehicle from Supabase (public.veiculos, joined with its
 * photos) and maps it to the same `Veiculo` shape the UI already expects
 * from the mock data. Any failure — network, RLS, an empty table — is
 * swallowed and resolves to an empty array so the vitrine's own empty
 * state ("Novidades chegando em breve...") handles it, instead of the
 * page erroring out.
 */
export async function getVeiculos(): Promise<Veiculo[]> {
  if (!supabase) {
    console.error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("veiculos")
      .select(
        "id, marca, modelo, ano, km, preco, combustivel, cambio, cor, status, destaque, veiculo_fotos(url, ordem)"
      )
      .order("created_at", { ascending: false })
      .order("ordem", { foreignTable: "veiculo_fotos", ascending: true })
      .returns<VeiculoRow[]>();

    if (error) {
      console.error("Erro ao buscar veículos no Supabase:", error.message);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      marca: row.marca,
      modelo: row.modelo,
      ano: row.ano,
      km: row.km,
      preco: Number(row.preco),
      combustivel: row.combustivel,
      cambio: row.cambio,
      cor: row.cor,
      status: row.status,
      destaque: row.destaque,
      fotos: (row.veiculo_fotos ?? [])
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map((foto) => foto.url),
    }));
  } catch (err) {
    console.error("Erro ao buscar veículos no Supabase:", err);
    return [];
  }
}
