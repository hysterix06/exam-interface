import * as React from "react"
import { cn } from "cn"

/** Plain tables with one look everywhere. Wraps in a scroller on narrow screens. */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  )
}

function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("border-b bg-muted/40 text-left text-xs text-muted-foreground", className)} {...props} />
}

function TH({ className, ...props }: React.ComponentProps<"th">) {
  return <th scope="col" className={cn("px-3 py-2 font-medium whitespace-nowrap", className)} {...props} />
}

function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b last:border-b-0 hover:bg-muted/40", className)} {...props} />
}

function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-3 py-2.5 align-middle", className)} {...props} />
}

export { Table, THead, TH, TR, TD }
