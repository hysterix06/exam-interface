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
    <header className={cn("mb-8", className)}>
      {back ? (
        <Link href={back.href} className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
            {meta}
          </div>
          {description ? <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

export { PageHeader }
