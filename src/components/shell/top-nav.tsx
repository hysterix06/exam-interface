"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The student bar's links. "Exams" is home, and also owns /exams/*. */
export function TopNav({ items }: { items: { href: string; label: string; also?: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 text-sm">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(`${item.href}/`)) ||
          (item.also !== undefined && (pathname === item.also || pathname.startsWith(`${item.also}/`)));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="relative rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-2.5 aria-[current=page]:after:-bottom-[13px] aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-brand"
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
