import Link from "next/link"
import * as React from "react"
import { cn } from "cn"

/** A labelled number. When it links, the number is how you get to the detail. */
function Stat({
  label,
  value,
  hint,
  href,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  href?: string
  className?: string
}) {
  const body = (
    <>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd> : null}
    </>
  )
  return href ? (
    <Link href={href} className={cn("block rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50", className)}>
      <dl>{body}</dl>
    </Link>
  ) : (
    <dl className={cn("rounded-lg border px-4 py-3", className)}>{body}</dl>
  )
}

function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>{children}</div>
}

export { Stat, StatGrid }
