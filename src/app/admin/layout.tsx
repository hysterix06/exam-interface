import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/server/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireRole("admin", "instructor");
  return <AppShell user={user}>{children}</AppShell>;
}
