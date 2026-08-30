import { tryCreateClient } from "./supabase-browser";
import { FOTOS_BUCKET, validarFoto } from "./veiculo-form";

/**
 * Uploads happen from the browser (not a Server Action) so the admin's
 * own session satisfies the bucket's "admins only" insert policy, and so
 * the file bytes never have to make an extra hop through the server.
 */

/** Keeps the extension, drops anything that could break a storage key. */
function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > -1 ? name.slice(dot + 1).toLowerCase() : "jpg";
  const base = (dot > -1 ? name.slice(0, dot) : name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();

  return `${base || "foto"}.${ext.replace(/[^a-z0-9]/g, "") || "jpg"}`;
}

export interface UploadedFoto {
  url: string;
}

export interface UploadFailure {
  name: string;
  message: string;
}

/**
 * Sends one file to `fotos-veiculos/<veiculoId>/...` and resolves to its
 * public URL. Never throws — a failure comes back as `{ error }` so the
 * caller can keep going with the remaining photos.
 */
export async function uploadFoto(
  veiculoId: string,
  file: File
): Promise<{ url?: string; error?: string }> {
  // Re-checked here as well as at pick time: this is the last gate on
  // our side before the bytes leave the browser. The bucket policy
  // (migration 0002) is what actually enforces it server-side.
  const invalido = validarFoto(file);
  if (invalido) return { error: invalido };

  const supabase = tryCreateClient();
  if (!supabase) return { error: "Serviço de upload indisponível." };

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${veiculoId}/${unique}-${safeFileName(file.name)}`;

  try {
    const { error } = await supabase.storage
      .from(FOTOS_BUCKET)
      .upload(path, file, { cacheControl: "3600", upsert: false });

    if (error) {
      console.error("[uploadFoto]", error.message);
      return { error: "falha ao enviar o arquivo" };
    }

    const { data } = supabase.storage.from(FOTOS_BUCKET).getPublicUrl(path);

    if (!data?.publicUrl) return { error: "URL pública não gerada." };

    return { url: data.publicUrl };
  } catch (err) {
    console.error("[uploadFoto]", err);
    return { error: "falha inesperada no envio" };
  }
}
