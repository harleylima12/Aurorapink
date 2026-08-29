import HeroScrollVideo from "@/components/HeroScrollVideo";
import EstoqueSection from "@/components/EstoqueSection";
import { getVeiculos } from "@/lib/supabase";

// Vitrine reflects whatever is in Supabase right now, so it shouldn't be
// frozen at build time — always fetch fresh on request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const veiculos = await getVeiculos();

  return (
    <>
      <HeroScrollVideo />
      <EstoqueSection veiculos={veiculos} />
    </>
  );
}
