"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { nextBoundary } from "@/lib/realtime/signal";
import { useTableSignal } from "@/lib/realtime/use-table-signal";

/**
 * Keeps the student home current without a reload: refreshes when an exam
 * or assignment changes (a teacher opens, closes or releases it) and the moment a scheduled
 * window opens or closes, which no row change announces.
 */
export function RefreshOnChange({ boundaries, assignments = false }: { boundaries: (string | null)[]; assignments?: boolean }) {
  const router = useRouter();
  useTableSignal({ table: "exams", onSignal: () => router.refresh(), fallbackMs: 60_000, connectedMs: 120_000 });
  // Assignments published, rescheduled or released.
  useTableSignal({ table: "assignments", onSignal: () => router.refresh(), fallbackMs: 120_000, connectedMs: 300_000, enabled: assignments });

  useEffect(() => {
    const at = nextBoundary(boundaries, Date.now());
    // setTimeout can't wait longer than ~24 days; anything past that refreshes on the next visit anyway.
    if (at === null || at - Date.now() > 2 ** 31 - 1) return;
    const t = setTimeout(() => router.refresh(), at - Date.now() + 500);
    return () => clearTimeout(t);
  }, [boundaries, router]);

  return null;
}
