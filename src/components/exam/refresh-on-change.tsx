"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { nextBoundary } from "@/lib/realtime/signal";
import { useTableSignal } from "@/lib/realtime/use-table-signal";

/**
 * Keeps the student home current without a reload: refreshes when an exam
 * changes (an instructor opens or closes it) and the moment a scheduled
 * window opens or closes, which no row change announces.
 */
export function RefreshOnChange({ boundaries }: { boundaries: (string | null)[] }) {
  const router = useRouter();
  useTableSignal({ table: "exams", onSignal: () => router.refresh(), fallbackMs: 60_000, connectedMs: 120_000 });

  useEffect(() => {
    const at = nextBoundary(boundaries, Date.now());
    // setTimeout can't wait longer than ~24 days; anything past that refreshes on the next visit anyway.
    if (at === null || at - Date.now() > 2 ** 31 - 1) return;
    const t = setTimeout(() => router.refresh(), at - Date.now() + 500);
    return () => clearTimeout(t);
  }, [boundaries, router]);

  return null;
}
