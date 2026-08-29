"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { FOTOS_BUCKET, type VeiculoInput } from "@/lib/veiculo-form";
import type { VeiculoStatus } from "@/data/veiculos-mock";

function refresh() {
  revalidatePath("/admin");
  revalidatePath("/admin/veiculos");
  revalidatePath("/");
  revalidatePath("/veiculos");
}

/**
 * Recovers the object path inside the bucket from a Supabase public URL,
 * so photos removed from a vehicle can also be dropped from Storage
 * instead of lingering as orphans.
 */
function storagePathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${FOTOS_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;

  try {
    return decodeURIComponent(url.slice(index + marker.length));
  } catch {
    return url.slice(index + marker.length);
  }
}

export interface ActionResult {
  id?: string;
  error?: string;
}

export async function createVeiculo(input: VeiculoInput): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Serviço indisponível no momento." };

  const { data, error } = await supabase
    .from("veiculos")
    .insert({ ...input, status: "disponivel" })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Erro ao criar veículo:", error?.message);
    return { error: error?.message ?? "Não foi possível salvar o veículo." };
  }

  refresh();
  return { id: data.id };
}

export async function updateVeiculo(
  id: string,
  input: VeiculoInput
): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Serviço indisponível no momento." };

  const { error } = await supabase.from("veiculos").update(input).eq("id", id);

  if (error) {
    console.error("Erro ao atualizar veículo:", error.message);
    return { error: error.message };
  }

  refresh();
  revalidatePath(`/veiculos/${id}`);
  return { id };
}

/**
 * Rewrites the vehicle's whole photo list in one shot: the incoming URLs
 * become rows 0..n in the given order, and any photo that used to belong
 * to this vehicle but isn't in the new list is deleted from Storage too.
 * Handles reordering, removal and additions with a single code path.
 */
export async function replaceFotos(
  veiculoId: string,
  urls: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Serviço indisponível no momento." };

  const { data: atuais, error: fetchError } = await supabase
    .from("veiculo_fotos")
    .select("url")
    .eq("veiculo_id", veiculoId);

  if (fetchError) {
    console.error("Erro ao ler fotos atuais:", fetchError.message);
    return { error: fetchError.message };
  }

  const { error: deleteError } = await supabase
    .from("veiculo_fotos")
    .delete()
    .eq("veiculo_id", veiculoId);

  if (deleteError) {
    console.error("Erro ao limpar fotos:", deleteError.message);
    return { error: deleteError.message };
  }

  if (urls.length > 0) {
    const { error: insertError } = await supabase.from("veiculo_fotos").insert(
      urls.map((url, ordem) => ({ veiculo_id: veiculoId, url, ordem }))
    );

    if (insertError) {
      console.error("Erro ao salvar fotos:", insertError.message);
      return { error: insertError.message };
    }
  }

  // Drop the files that are no longer referenced. A failure here leaves
  // an orphan file but doesn't break the save, so it's only logged.
  const mantidas = new Set(urls);
  const removidas = (atuais ?? [])
    .map((foto) => foto.url)
    .filter((url) => !mantidas.has(url))
    .map(storagePathFromUrl)
    .filter((path): path is string => Boolean(path));

  if (removidas.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(FOTOS_BUCKET)
      .remove(removidas);

    if (storageError) {
      console.error("Erro ao remover fotos do Storage:", storageError.message);
    }
  }

  refresh();
  revalidatePath(`/veiculos/${veiculoId}`);
  return {};
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
  revalidatePath(`/veiculos/${id}`);
}

export async function deleteVeiculo(id: string) {
  const supabase = await createClient();
  if (!supabase) throw new Error("Serviço indisponível no momento.");

  // Clear Storage first: the veiculo_fotos rows cascade away with the
  // vehicle, and once they're gone the file paths are unrecoverable.
  const { data: fotos } = await supabase
    .from("veiculo_fotos")
    .select("url")
    .eq("veiculo_id", id);

  const paths = (fotos ?? [])
    .map((foto) => storagePathFromUrl(foto.url))
    .filter((path): path is string => Boolean(path));

  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(FOTOS_BUCKET)
      .remove(paths);

    if (storageError) {
      console.error("Erro ao remover fotos do Storage:", storageError.message);
    }
  }

  const { error } = await supabase.from("veiculos").delete().eq("id", id);

  if (error) throw new Error(error.message);
  refresh();
}
