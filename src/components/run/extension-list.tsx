"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeExtensionAction } from "@/app/teach/actions";
import { Button } from "@/components/ui/button";
import { StatusText } from "@/components/ui/notice";
import { fmtNum } from "@/engine/grading/format";

interface Ext {
  id: string;
  name: string | null;
  email: string;
  kind: "multiplier" | "minutes";
  value: number;
  reason: string | null;
  examId: string | null;
}

/** Extra time already granted on this exam, including standing accommodations. */
export function ExtensionList({ examId, extensions, canRemoveStanding }: { examId: string; extensions: Ext[]; canRemoveStanding: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <ul className="divide-y rounded-lg border text-sm">
        {extensions.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
            <span className="font-medium">{e.name ?? e.email}</span>
            <span className="tabular-nums">{e.kind === "minutes" ? `${e.value > 0 ? "+" : ""}${fmtNum(e.value)} min` : `×${fmtNum(e.value)} time`}</span>
            <span className="flex-1 truncate text-muted-foreground">
              {e.examId === null ? "All exams · " : ""}
              {e.reason}
            </span>
            {(e.examId !== null || canRemoveStanding) && (
              <Button
                variant="ghost"
                size="xs"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await removeExtensionAction({ examId, extensionId: e.id });
                    if (!r.ok) return setError(r.error);
                    setError(null);
                    router.refresh();
                  })
                }
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && <StatusText ok={false}>{error}</StatusText>}
    </div>
  );
}
