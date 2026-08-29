import type { VeiculoFoto, VeiculoStatus } from "@/lib/types";
import { createClient } from "./supabase-server";

export interface AdminVeiculoRow {
  id: string;
  marca: string;
  modelo: string;
  preco: number;
  status: VeiculoStatus;
  foto: string | null;
}

interface RawRow {
  id: string;
  marca: string;
  modelo: string;
  preco: number;
  status: VeiculoStatus;
  veiculo_fotos: { url: string; ordem: number; categoria: string | null }[] | null;
}

export interface AdminVeiculoDetalhe {
  id: string;
  marca: string;
  modelo: string;
  ano: number;
  km: number;
  preco: number;
  combustivel: string;
  cambio: string;
  cor: string;
  descricao: string | null;
  destaque: boolean;
  status: VeiculoStatus;
  fotos: VeiculoFoto[];
}

/**
 * Loads one vehicle with every column the edit form needs. Resolves to
 * null when it doesn't exist (or can't be read), so the page can render
 * a proper 404 instead of crashing.
 */
export async function getVeiculoById(
  id: string
): Promise<AdminVeiculoDetalhe | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("veiculos")
    .select(
      "id, marca, modelo, ano, km, preco, combustivel, cambio, cor, descricao, destaque, status, veiculo_fotos(url, ordem, categoria)"
    )
    .eq("id", id)
    .order("ordem", { foreignTable: "veiculo_fotos", ascending: true })
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("Erro ao buscar veículo:", error.message);
    return null;
  }

  const row = data as unknown as RawRow & {
    ano: number;
    km: number;
    combustivel: string;
    cambio: string;
    cor: string;
    descricao: string | null;
    destaque: boolean;
  };

  return {
    id: row.id,
    marca: row.marca,
    modelo: row.modelo,
    ano: row.ano,
    km: row.km,
    preco: Number(row.preco),
    combustivel: row.combustivel,
    cambio: row.cambio,
    cor: row.cor,
    descricao: row.descricao,
    destaque: row.destaque,
    status: row.status,
    fotos: (row.veiculo_fotos ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((foto) => ({ url: foto.url, categoria: foto.categoria ?? null })),
  };
}

export async function getAdminVeiculos(): Promise<AdminVeiculoRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("veiculos")
    .select("id, marca, modelo, preco, status, veiculo_fotos(url, ordem)")
    .order("created_at", { ascending: false })
    .order("ordem", { foreignTable: "veiculo_fotos", ascending: true })
    .returns<RawRow[]>();

  if (error || !data) {
    if (error) console.error("Erro ao buscar veículos (admin):", error.message);
    return [];
  }

  return data.map((row) => {
    const fotos = (row.veiculo_fotos ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem);

    return {
      id: row.id,
      marca: row.marca,
      modelo: row.modelo,
      preco: Number(row.preco),
      status: row.status,
      foto: fotos[0]?.url ?? null,
    };
  });
}
