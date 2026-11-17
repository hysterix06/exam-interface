import Link from "next/link"
import * as React from "react"
import { cn } from "cn"
import type { Explanation } from "@/engine/types"
import { Explain } from "./explain"

/** A labelled number. When it links, the number is how you get to the detail. */
function Stat({
  label,
  value,
  hint,
  href,
  explain,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  href?: string
  /** Working behind the number, shown when it is clicked (not with `href`). */
  explain?: Explanation | null
  className?: string
}) {
  const body = (
    <>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums">
        {explain && !href ? <Explain explanation={explain}>{value}</Explain> : value}
      </dd>
      {hint ? <dd className="mt-2 text-xs text-muted-foreground">{hint}</dd> : null}
    </>
  )
  return href ? (
    <Link href={href} className={cn("block border-t border-foreground/20 pt-4 transition-colors hover:border-foreground", className)}>
      <dl>{body}</dl>
    </Link>
  ) : (
    <dl className={cn("border-t border-foreground/20 pt-4", className)}>{body}</dl>
  )
}

function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4", className)}>{children}</div>
}

export { Stat, StatGrid }
