"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const KEY = "theme";
const listeners = new Set<() => void>();

const isDark = () => document.documentElement.classList.contains("dark");

function setDark(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(KEY, dark ? "dark" : "light");
  } catch {
    // Private mode: the choice just won't persist.
  }
  listeners.forEach((l) => l());
}

/**
 * Light/dark switch. The initial class is set before first paint by the inline
 * script in the root layout, so there is no flash; this only flips it.
 */
export function ThemeToggle() {
  const dark = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    isDark,
    () => false,
  );
  return (
    <Button variant="ghost" size="icon-sm" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setDark(!dark)}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
