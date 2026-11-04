"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "cn"

export interface LinkTab {
  href: string
  label: string
  /** Match the path exactly rather than as a prefix. */
  exact?: boolean
  /** Shown but not clickable, with the reason as a tooltip. */
  disabledReason?: string
  count?: number
}

/** Page-level tabs that are real links, so every tab has its own URL. */
function LinkTabs({ tabs, label, className }: { tabs: LinkTab[]; label: string; className?: string }) {
  const pathname = usePathname()
  return (
    <nav aria-label={label} className={cn("-mx-1 mb-8 flex gap-1 overflow-x-auto border-b px-1 text-sm", className)}>
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`)
        const cls = "-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 whitespace-nowrap"
        if (t.disabledReason) {
          return (
            <span key={t.href} className={cn(cls, "cursor-not-allowed text-muted-foreground/50")} title={t.disabledReason} aria-disabled="true">
              {t.label}
            </span>
          )
        }
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(cls, "text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground")}
          >
            {t.label}
            {t.count ? <span className="rounded-sm bg-muted px-1 text-xs tabular-nums text-muted-foreground">{t.count}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}

export { LinkTabs }
