"use client"

import { useSyncExternalStore } from "react"
import { fmtDate, fmtDateTime, fmtRelative } from "@/lib/format"

const subscribe = () => () => {}

/**
 * A date in the reader's own time zone. Server and hydration render the same
 * UTC text (so nothing mismatches); the browser then swaps in local time.
 */
function LocalTime({ iso, format = "datetime", className }: { iso: string; format?: "datetime" | "date" | "relative"; className?: string }) {
  const onClient = useSyncExternalStore(subscribe, () => true, () => false)
  const d = new Date(iso)
  const tz = onClient ? undefined : "UTC"
  const text = format === "date" ? fmtDate(d, new Date(), tz) : format === "relative" && onClient ? fmtRelative(d) : fmtDateTime(d, new Date(), tz)
  return (
    <time dateTime={iso} className={className} title={onClient ? d.toLocaleString() : undefined}>
      {text}
    </time>
  )
}

export { LocalTime }
