import { AppShell } from "@/components/shell/app-shell";
import { requireAdmin } from "@/server/access";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { user } = await requireAdmin();
  return <AppShell user={user}>{children}</AppShell>;
}
