"use client";

import { useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";

const KEY = "theme";
const listeners = new Set<() => void>();

function stored(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Light, dark or follow the system. The initial class is set before first
 * paint by the inline script in the root layout; this only changes it.
 */
export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Private mode: the choice just won't persist.
  }
  apply(theme);
  listeners.forEach((l) => l());
}

export function useTheme() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const mq = matchMedia("(prefers-color-scheme: dark)");
      const onSystem = () => stored() === "system" && apply("system");
      mq.addEventListener("change", onSystem);
      return () => {
        listeners.delete(cb);
        mq.removeEventListener("change", onSystem);
      };
    },
    stored,
    () => "system" as Theme,
  );
}
