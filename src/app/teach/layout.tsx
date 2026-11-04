import { AppShell } from "@/components/shell/app-shell";
import { requireStaff } from "@/server/access";

export default async function TeachLayout({ children }: LayoutProps<"/teach">) {
  const { user } = await requireStaff();
  return <AppShell user={user}>{children}</AppShell>;
}
