import * as React from "react"
import { cn } from "cn"

/** What to show when a list is empty: one sentence, and at most one way forward. */
function EmptyState({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground", className)}>
      <p className="mx-auto max-w-sm text-pretty">{children}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
