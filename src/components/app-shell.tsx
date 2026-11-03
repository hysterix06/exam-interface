import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/server/auth";

type NavItem = { href: string; label: string };

const STAFF_NAV: NavItem[] = [
  { href: "/author", label: "Author" },
  { href: "/admin", label: "Admin" },
  { href: "/exams", label: "Student view" },
];

export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const nav = user.role === "student" ? [] : STAFF_NAV;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <Link href="/" className="font-semibold tracking-tight">
            Exam
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {user.fullName ?? user.email} · {user.role}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
