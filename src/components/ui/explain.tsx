"use client"

import { Popover as P } from "radix-ui"
import * as React from "react"
import { cn } from "cn"
import type { Explanation } from "@/engine/types"

/**
 * A number that shows how it was calculated when clicked. The working comes
 * from the engine as data; this only lays it out.
 */
function Explain({
  explanation,
  children,
  className,
}: {
  explanation: Explanation | null | undefined
  children: React.ReactNode
  className?: string
}) {
  if (!explanation) return <>{children}</>
  return (
    <P.Root>
      <P.Trigger
        className={cn(
          "cursor-help rounded-sm underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        {children}
        <span className="sr-only"> (show how this is calculated)</span>
      </P.Trigger>
      <P.Portal>
        <P.Content
          sideOffset={6}
          collisionPadding={16}
          className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <p className="font-medium">How this is calculated</p>
          <p className="mt-1 text-muted-foreground">{explanation.formula}</p>
          {explanation.inputs.length > 0 && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {explanation.inputs.map((i, n) => (
                <React.Fragment key={n}>
                  <dt className="text-muted-foreground">{i.label}</dt>
                  <dd className="text-right tabular-nums">{i.value}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}
          {explanation.note ? <p className="mt-2 text-xs text-muted-foreground">{explanation.note}</p> : null}
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}

export { Explain }
