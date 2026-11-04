"use client"

import * as React from "react"
import { cn } from "cn"

/** In-place tabs (no URL), e.g. Preview / Answer key inside an editor. */
function ButtonTabs<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: React.ReactNode }[]
  label: string
  className?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 border-b text-sm", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className="-mb-px border-b-2 border-transparent px-3 py-2 text-muted-foreground hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export { ButtonTabs }
