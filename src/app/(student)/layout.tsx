import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/auth";

// Students' app. Staff land here only to see their own preview results, and
// get their usual shell.
export default async function StudentLayout({ children }: LayoutProps<"/">) {
  const user = await requireRole();
  return <AppShell user={user}>{children}</AppShell>;
}
