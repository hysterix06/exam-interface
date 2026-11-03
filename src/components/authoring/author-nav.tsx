"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/author", label: "Overview", exact: true },
  { href: "/author/questions", label: "Questions" },
  { href: "/author/topics", label: "Topics" },
  { href: "/author/exams", label: "Exams" },
];

export function AuthorNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Authoring" className="mb-8 flex gap-1 border-b text-sm">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
