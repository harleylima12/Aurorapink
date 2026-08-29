import type { VeiculoStatus } from "@/data/veiculos-mock";
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
  veiculo_fotos: { url: string; ordem: number }[] | null;
}

export async function getAdminVeiculos(): Promise<AdminVeiculoRow[]> {
  const supabase = await createClient();

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
