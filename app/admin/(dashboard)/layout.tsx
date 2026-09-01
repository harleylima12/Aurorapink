import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase-server";
import AdminSidebar from "@/components/admin/AdminSidebar";

// Middleware already guards /admin/*, but Supabase's own guidance is to
// treat that as the fast-path, not the only check — re-verify here too
// so a Server Component render is never trusted on middleware alone.
export default async function AdminDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  if (!supabase) redirect("/admin/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: perfil } = await supabase
    .from("perfis")
    .select("role")
    .eq("id", user.id)
    .single();

  if (perfil?.role !== "admin") redirect("/admin/login");

  return (
    <div className="mx-auto flex flex-col lg:flex-row max-w-[1600px] lg:min-h-[calc(100vh-1px)]">
      <AdminSidebar />
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</div>
    </div>
  );
}
