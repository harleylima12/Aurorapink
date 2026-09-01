import { createClient } from "@supabase/supabase-js";
import type { Veiculo, VeiculoStatus } from "@/lib/types";

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

const VEICULO_CAMPOS =
  "id, marca, modelo, ano, km, preco, combustivel, cambio, cor, descricao, status, destaque";

const FOTOS_COM_CATEGORIA = "veiculo_fotos(url, ordem, categoria)";
const FOTOS_SEM_CATEGORIA = "veiculo_fotos(url, ordem)";

const veiculoSelect = (fotos: string) => `${VEICULO_CAMPOS}, ${fotos}`;

/**
 * True when the failure is "this database doesn't expose
 * veiculo_fotos.categoria" — the column is missing (migration not run)
 * or PostgREST's schema cache predates it (42703 / PGRST204).
 */
type ErroConsulta = { message?: string; details?: string | null } | null;

function categoriaIndisponivel(error: ErroConsulta) {
  if (!error) return false;
  const texto = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return texto.includes("categoria");
}

/**
 * Runs a query asking for the category and, if this database can't serve
 * that column yet, transparently re-runs it without. Losing the labels
 * is a far better outcome than an empty vitrine or a 404 on every
 * vehicle, and it self-heals the moment the column becomes readable.
 */
async function comFallbackDeCategoria<T, E extends ErroConsulta>(
  run: (fotosSelect: string) => PromiseLike<{ data: T; error: E }>
): Promise<{ data: T; error: E }> {
  const resultado = await run(FOTOS_COM_CATEGORIA);

  if (!categoriaIndisponivel(resultado.error)) return resultado;

  console.error(
    "veiculo_fotos.categoria indisponível nesta base — relendo sem as categorias. " +
      "Rode a migração 0001 e, em seguida, NOTIFY pgrst, 'reload schema';"
  );

  return run(FOTOS_SEM_CATEGORIA);
}

interface VeiculoFotoRow {
  url: string;
  ordem: number;
  /** Absent when read through the no-category fallback above. */
  categoria?: string | null;
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
  descricao: string | null;
  status: VeiculoStatus;
  destaque: boolean;
  veiculo_fotos: VeiculoFotoRow[] | null;
}

/** Turns a raw joined row into the `Veiculo` shape the UI renders. */
function mapVeiculo(row: VeiculoRow): Veiculo {
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
    descricao: row.descricao ?? null,
    status: row.status,
    destaque: row.destaque,
    fotos: (row.veiculo_fotos ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((foto) => ({ url: foto.url, categoria: foto.categoria ?? null })),
  };
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
    const { data, error } = await comFallbackDeCategoria((fotos) =>
      supabase!
        .from("veiculos")
        .select(veiculoSelect(fotos))
        .order("created_at", { ascending: false })
        .order("ordem", { foreignTable: "veiculo_fotos", ascending: true })
        .returns<VeiculoRow[]>()
    );

    if (error) {
      console.error("Erro ao buscar veículos no Supabase:", error.message);
      return [];
    }

    return (data ?? []).map(mapVeiculo);
  } catch (err) {
    console.error("Erro ao buscar veículos no Supabase:", err);
    return [];
  }
}

/**
 * Loads a single vehicle with its photos ordered by `ordem`. Resolves to
 * null for anything that isn't a real, readable vehicle — unknown id, a
 * malformed one (the column is a uuid, so a stale slug makes Postgres
 * reject the filter), Supabase being unreachable — and the page turns
 * that into a 404.
 */
export async function getVeiculoById(id: string): Promise<Veiculo | null> {
  if (!supabase) {
    console.error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
    return null;
  }

  try {
    const { data, error } = await comFallbackDeCategoria((fotos) =>
      supabase!
        .from("veiculos")
        .select(veiculoSelect(fotos))
        .eq("id", id)
        .order("ordem", { foreignTable: "veiculo_fotos", ascending: true })
        .maybeSingle<VeiculoRow>()
    );

    if (error || !data) {
      if (error) console.error("Erro ao buscar veículo:", error.message);
      return null;
    }

    return mapVeiculo(data);
  } catch (err) {
    console.error("Erro ao buscar veículo:", err);
    return null;
  }
}

/**
 * Suggestions for the bottom of a vehicle's page: same brand first, then
 * anything in a similar price band (±30%), never the vehicle itself and
 * never a duplicate. Available vehicles are preferred over sold ones so
 * the section doesn't lead with something nobody can buy.
 */
export async function getVeiculosSimilares(
  veiculo: Veiculo,
  limite = 3
): Promise<Veiculo[]> {
  if (!supabase) return [];

  try {
    const precoMin = veiculo.preco * 0.7;
    const precoMax = veiculo.preco * 1.3;

    // Two narrow queries instead of one interpolated `.or()` filter, so a
    // brand containing a comma or parenthesis can't corrupt the syntax.
    const [mesmaMarca, faixaPreco] = await Promise.all([
      comFallbackDeCategoria((fotos) =>
        supabase!
          .from("veiculos")
          .select(veiculoSelect(fotos))
          .eq("marca", veiculo.marca)
          .neq("id", veiculo.id)
          .order("ordem", { foreignTable: "veiculo_fotos", ascending: true })
          .limit(limite * 2)
          .returns<VeiculoRow[]>()
      ),
      comFallbackDeCategoria((fotos) =>
        supabase!
          .from("veiculos")
          .select(veiculoSelect(fotos))
          .gte("preco", precoMin)
          .lte("preco", precoMax)
          .neq("id", veiculo.id)
          .order("ordem", { foreignTable: "veiculo_fotos", ascending: true })
          .limit(limite * 2)
          .returns<VeiculoRow[]>()
      ),
    ]);

    if (mesmaMarca.error) {
      console.error("Erro ao buscar similares:", mesmaMarca.error.message);
    }
    if (faixaPreco.error) {
      console.error("Erro ao buscar similares:", faixaPreco.error.message);
    }

    const candidatos = [...(mesmaMarca.data ?? []), ...(faixaPreco.data ?? [])];

    const unicos = new Map<string, Veiculo>();
    for (const row of candidatos) {
      if (!unicos.has(row.id)) unicos.set(row.id, mapVeiculo(row));
    }

    return Array.from(unicos.values())
      .sort((a, b) => Number(a.status === "vendido") - Number(b.status === "vendido"))
      .slice(0, limite);
  } catch (err) {
    console.error("Erro ao buscar similares:", err);
    return [];
  }
}
