import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
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
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <header className="border-b print:hidden">
        <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2">
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
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {user.fullName ?? user.email} · {user.role}
            </span>
            <ThemeToggle />
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
