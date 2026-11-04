import * as React from "react"
import { cn } from "cn"

/** A titled block of a page. Sections stack with even spacing and a hairline. */
function Section({
  title,
  description,
  actions,
  className,
  children,
  id,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} aria-labelledby={id && title ? `${id}-title` : undefined} className={cn("mt-12 first:mt-0", className)}>
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <div className="min-w-0 flex-1">
            {title ? <h2 id={id ? `${id}-title` : undefined} className="text-base font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export { Section }
