import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Quiet, squared labels. Colour is carried by the text, never a fill.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border text-muted-foreground",
        strong: "border-foreground/80 text-foreground",
        success: "border-success/35 text-success",
        warning: "border-warning/40 text-warning",
        danger: "border-destructive/35 text-destructive",
        brand: "border-brand/35 text-brand",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { Badge, badgeVariants }
