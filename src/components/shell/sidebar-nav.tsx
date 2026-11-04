"use client";

import { Menu as MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export interface NavItem {
  href: string;
  label: string;
  /** Match the path exactly (for a section's home). */
  exact?: boolean;
  count?: number;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The most specific matching item wins, so /teach/exams doesn't also light up /teach. */
function activeHref(pathname: string, groups: NavGroup[]) {
  const matches = groups.flatMap((g) => g.items).filter((i) => isActive(pathname, i));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function SidebarNav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeHref(pathname, groups);
  return (
    <nav aria-label="Main" className="grid gap-6">
      {groups.map((g, i) => (
        <div key={g.label ?? i}>
          {g.label ? <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">{g.label}</p> : null}
          <ul className="grid gap-px">
            {g.items.map((item) => {
              const active = item.href === current;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      "aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground",
                      "aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-1.5 aria-[current=page]:before:left-0 aria-[current=page]:before:w-0.5 aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-brand",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.count ? <span className="text-xs tabular-nums text-muted-foreground">{item.count}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Below the lg breakpoint the sidebar opens as a panel from a menu button. */
export function MobileNav({ groups, title }: { groups: NavGroup[]; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="-ml-1.5 rounded-md p-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="Open navigation">
        <MenuIcon className="size-5" />
      </DialogTrigger>
      <DialogContent
        title={title}
        className="top-0 left-0 h-dvh max-h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 content-start rounded-none border-y-0 border-l-0"
      >
        <SidebarNav groups={groups} onNavigate={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
