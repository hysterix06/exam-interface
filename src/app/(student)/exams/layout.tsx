import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/server/auth";

export default async function ExamsLayout({ children }: LayoutProps<"/exams">) {
  const user = await requireRole("admin", "instructor", "student");
  return <AppShell user={user}>{children}</AppShell>;
}
