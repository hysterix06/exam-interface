"use client"

import { Check } from "lucide-react"
import { DropdownMenu as M } from "radix-ui"
import * as React from "react"
import { cn } from "cn"

const Menu = M.Root
const MenuTrigger = M.Trigger

function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 overflow-hidden rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className
        )}
        {...props}
      />
    </M.Portal>
  )
}

const item =
  "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground"

function MenuItem({ className, destructive, ...props }: React.ComponentProps<typeof M.Item> & { destructive?: boolean }) {
  return <M.Item className={cn(item, destructive && "text-destructive [&_svg]:text-destructive", className)} {...props} />
}

function MenuRadioGroup(props: React.ComponentProps<typeof M.RadioGroup>) {
  return <M.RadioGroup {...props} />
}

function MenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(item, "pl-7", className)} {...props}>
      <M.ItemIndicator className="absolute left-2 flex items-center">
        <Check />
      </M.ItemIndicator>
      {children}
    </M.RadioItem>
  )
}

function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)} {...props} />
}

function MenuSeparator({ className, ...props }: React.ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
}

export { Menu, MenuTrigger, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuLabel, MenuSeparator }
