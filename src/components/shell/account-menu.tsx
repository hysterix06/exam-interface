"use client";

import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { type Theme, setTheme, useTheme } from "./theme";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Who you are, your account, the theme, and sign out. */
export function AccountMenu({ name, email, roleLabel, compact = false }: { name: string; email: string; roleLabel: string; compact?: boolean }) {
  const theme = useTheme();
  return (
    <Menu>
      <MenuTrigger
        className={
          compact
            ? "flex size-8 items-center justify-center rounded-full border text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            : "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        }
      >
        <span aria-hidden className={compact ? "" : "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium"}>{initials(name)}</span>
        {compact && <span className="sr-only">Account</span>}
        {!compact && (
          <span className="min-w-0">
            <span className="sr-only">Account: </span>
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{roleLabel}</span>
          </span>
        )}
      </MenuTrigger>
      <MenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} className="w-60">
        <MenuLabel className="text-foreground">
          <span className="block truncate font-medium">{name}</span>
          <span className="block truncate font-normal text-muted-foreground">{email}</span>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/account">
            <UserRound /> Account
          </Link>
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Appearance</MenuLabel>
        <MenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <MenuRadioItem value="system">Match system</MenuRadioItem>
          <MenuRadioItem value="light">Light</MenuRadioItem>
          <MenuRadioItem value="dark">Dark</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
