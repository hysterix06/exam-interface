import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"
import * as React from "react"
import { cn } from "cn"

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle }
const TONES = {
  info: "text-foreground [&>svg]:text-muted-foreground",
  success: "text-foreground [&>svg]:text-success",
  warning: "text-foreground [&>svg]:text-warning",
  error: "border-destructive/30 text-destructive",
}

/** The one inline message style: status after an action, or a standing caveat. */
function Notice({
  tone = "info",
  className,
  children,
  live = false,
}: {
  tone?: keyof typeof ICONS
  className?: string
  children: React.ReactNode
  /** Announce to screen readers (results of an action). */
  live?: boolean
}) {
  const Icon = ICONS[tone]
  return (
    <div
      role={live ? (tone === "error" ? "alert" : "status") : undefined}
      className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm", TONES[tone], className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Just the words: a one-line result next to a button. */
function StatusText({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span role={ok ? "status" : "alert"} className={cn("text-sm", ok ? "text-muted-foreground" : "text-destructive")}>
      {children}
    </span>
  )
}

export { Notice, StatusText }
