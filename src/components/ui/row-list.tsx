import Link from "next/link"
import * as React from "react"
import { cn } from "cn"

/**
 * A bordered list of one-line rows. Each row is a primary label, a quiet second
 * line, and something on the right (a status, a number, or one action).
 */
function RowList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ul className={cn("divide-y overflow-hidden rounded-xl border", className)}>{children}</ul>
}

function Row({
  href,
  title,
  detail,
  aside,
  className,
}: {
  href?: string
  title: React.ReactNode
  detail?: React.ReactNode
  aside?: React.ReactNode
  className?: string
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.9375rem] font-medium">{title}</div>
        {detail ? <div className="mt-1 truncate text-sm text-muted-foreground">{detail}</div> : null}
      </div>
      {aside ? <div className="flex shrink-0 items-center gap-4 text-sm">{aside}</div> : null}
    </>
  )
  return (
    <li className={className}>
      {href ? (
        <Link href={href} className="flex items-center gap-6 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
          {inner}
        </Link>
      ) : (
        <div className="flex items-center gap-6 px-5 py-4">{inner}</div>
      )}
    </li>
  )
}

export { RowList, Row }
