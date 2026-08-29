"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { VeiculoStatus } from "@/data/veiculos-mock";

function refresh() {
  revalidatePath("/admin");
  revalidatePath("/admin/veiculos");
}

export async function toggleVeiculoStatus(id: string, novoStatus: VeiculoStatus) {
  const supabase = await createClient();
  if (!supabase) throw new Error("Serviço indisponível no momento.");

  const { error } = await supabase
    .from("veiculos")
    .update({ status: novoStatus })
    .eq("id", id);

  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteVeiculo(id: string) {
  const supabase = await createClient();
  if (!supabase) throw new Error("Serviço indisponível no momento.");

  const { error } = await supabase.from("veiculos").delete().eq("id", id);

  if (error) throw new Error(error.message);
  refresh();
}
