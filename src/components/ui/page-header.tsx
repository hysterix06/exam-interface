import Link from "next/link"
import * as React from "react"
import { cn } from "cn"

/**
 * The top of every page: an optional trail back, the title, one line of
 * context, and the page's actions on the right.
 */
function PageHeader({
  title,
  description,
  back,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  back?: { href: string; label: string }
  meta?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("mb-12", className)}>
      {back ? (
        <Link href={back.href} className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground">
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-serif text-[1.875rem] leading-tight font-semibold tracking-tight text-balance">{title}</h1>
            {meta}
          </div>
          {description ? <p className="mt-2 max-w-prose text-[0.9375rem] text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

export { PageHeader }
