"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { FOTOS_BUCKET, type VeiculoInput } from "@/lib/veiculo-form";
import type { VeiculoStatus } from "@/lib/types";

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

/**
 * What the user is allowed to see. Postgres messages name tables,
 * columns and constraints, so they stay in the server log and the UI
 * gets a plain sentence instead.
 */
const ERRO_GENERICO =
  "Não foi possível concluir a operação. Tente novamente em instantes.";

function registrar(contexto: string, erro: { message?: string } | null) {
  console.error(`[${contexto}]`, erro?.message ?? erro);
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
    registrar("createVeiculo", error);
    return { error: ERRO_GENERICO };
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
    registrar("updateVeiculo", error);
    return { error: ERRO_GENERICO };
  }

  refresh();
  revalidatePath(`/veiculos/${id}`);
  return { id };
}

export interface FotoPayload {
  url: string;
  /** Free text; empty/undefined stores null (no label on the site). */
  categoria?: string | null;
}

/**
 * Rewrites the vehicle's whole photo list in one shot: the incoming
 * photos become rows 0..n in the given order, and any photo that used to
 * belong to this vehicle but isn't in the new list is deleted from
 * Storage too. Handles reordering, removal, additions and category
 * changes with a single code path.
 */
export async function replaceFotos(
  veiculoId: string,
  fotos: FotoPayload[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Serviço indisponível no momento." };

  const { data: atuais, error: fetchError } = await supabase
    .from("veiculo_fotos")
    .select("id, url")
    .eq("veiculo_id", veiculoId);

  if (fetchError) {
    registrar("replaceFotos/ler", fetchError);
    return { error: ERRO_GENERICO };
  }

  // Insert BEFORE deleting. There's no transaction across PostgREST
  // calls, so deleting first means any failed insert — a missing
  // column, RLS, a dropped connection — destroys the vehicle's photos
  // with nothing to restore them from. This way a failure leaves the
  // old rows exactly as they were; the cost is a brief window where
  // both sets exist, which the delete below closes.
  if (fotos.length > 0) {
    const base = fotos.map((foto, ordem) => ({
      veiculo_id: veiculoId,
      url: foto.url,
      ordem,
    }));

    let { error: insertError } = await supabase.from("veiculo_fotos").insert(
      base.map((linha, i) => ({
        ...linha,
        categoria: fotos[i].categoria?.trim() ? fotos[i].categoria!.trim() : null,
      }))
    );

    // A database that doesn't expose veiculo_fotos.categoria yet should
    // still be able to save photos — the labels are the only casualty.
    if (
      insertError &&
      `${insertError.message} ${insertError.details ?? ""}`
        .toLowerCase()
        .includes("categoria")
    ) {
      console.error(
        "veiculo_fotos.categoria indisponível — salvando fotos sem categoria. " +
          "Rode a migração 0001 e, em seguida, NOTIFY pgrst, 'reload schema';"
      );
      ({ error: insertError } = await supabase
        .from("veiculo_fotos")
        .insert(base));
    }

    if (insertError) {
      registrar("replaceFotos/inserir", insertError);
      return { error: ERRO_GENERICO };
    }
  }

  const idsAntigos = (atuais ?? []).map((foto) => foto.id);

  if (idsAntigos.length > 0) {
    const { error: deleteError } = await supabase
      .from("veiculo_fotos")
      .delete()
      .in("id", idsAntigos);

    if (deleteError) {
      registrar("replaceFotos/limpar", deleteError);
      return { error: ERRO_GENERICO };
    }
  }

  // Drop the files that are no longer referenced. A failure here leaves
  // an orphan file but doesn't break the save, so it's only logged.
  const mantidas = new Set(fotos.map((foto) => foto.url));
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

  if (error) {
    registrar("toggleVeiculoStatus", error);
    throw new Error(ERRO_GENERICO);
  }
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

  if (error) {
    registrar("deleteVeiculo", error);
    throw new Error(ERRO_GENERICO);
  }
  refresh();
}
