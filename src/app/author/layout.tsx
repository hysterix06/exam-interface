import { AppShell } from "@/components/app-shell";
import { AuthorNav } from "@/components/authoring/author-nav";
import { requireRole } from "@/server/auth";

export default async function AuthorLayout({ children }: LayoutProps<"/author">) {
  const user = await requireRole("admin", "instructor");
  return (
    <AppShell user={user}>
      <AuthorNav />
      {children}
    </AppShell>
  );
}
