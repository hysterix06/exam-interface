"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteAssignmentAction, publishAssignmentAction, setReleasedAction, unpublishAssignmentAction } from "@/app/teach/assignments/actions";
import { Button } from "@/components/ui/button";
import { StatusText } from "@/components/ui/notice";

/** The few things that change an assignment's state: publish, back to draft, delete, release grades. */
export function AssignmentControls({ id, state, released, handedIn, blocking }: { id: string; state: "draft" | "published"; released: boolean; handedIn: number; blocking: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, after?: (r: Record<string, unknown>) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong.");
      setError(null);
      if (after) after(r);
      else router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <StatusText ok={false}>{error}</StatusText>}
      {state === "draft" ? (
        <>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => confirm("Delete this draft assignment?") && run(() => deleteAssignmentAction(id), (r) => router.push(`/teach/courses/${r.courseId}/assignments`))}>
            Delete
          </Button>
          <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" disabled={pending || blocking} title={blocking ? "Fix the issues below first" : undefined} onClick={() => run(() => publishAssignmentAction(id))}>
            Publish
          </Button>
        </>
      ) : (
        <>
          {handedIn === 0 && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => unpublishAssignmentAction(id))}>
              Back to draft
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => setReleasedAction(id, !released))}>
            {released ? "Hide grades" : "Release grades"}
          </Button>
        </>
      )}
    </div>
  );
}
