"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCodesAction, setExamStateAction, startPreviewAction } from "@/app/author/exams/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ExamStateName, nextStates, STATE_LABELS } from "@/engine/exam-state";

const MOVE_LABEL = (from: ExamStateName, to: ExamStateName) =>
  to === "open" ? (from === "scheduled" ? "Open exam" : "Reopen") : to === "closed" ? "Close exam" : to === "graded" ? "Mark graded" : "Release results";

/** Open/close/release and "take it as a student", shown beside the publish controls. */
export function RunControls({
  examId,
  state,
  requireCode,
  disabled,
}: {
  examId: string;
  state: ExamStateName;
  requireCode: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState("20");
  const [codes, setCodes] = useState<string[] | null>(null);

  const move = (to: ExamStateName) =>
    start(async () => {
      const r = await setExamStateAction(examId, to);
      if (!r.ok) return setError(r.error);
      setError(null);
      router.refresh();
    });

  const preview = () =>
    start(async () => {
      const r = await startPreviewAction(examId);
      if (!r.ok) return setError(r.error);
      router.push(`/attempt/${r.attemptId}`);
    });

  const generate = () =>
    start(async () => {
      const r = await createCodesAction(examId, Number(n));
      if (!r.ok) return setError(r.error);
      setError(null);
      setCodes(r.codes);
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={preview} disabled={pending || disabled}>
          Take it as a student
        </Button>
        {state !== "draft" && (
          <>
            <span className="mx-1 text-sm text-muted-foreground">Status: {STATE_LABELS[state]}</span>
            {nextStates(state).map((to) => (
              <Button key={to} variant={to === "open" ? "default" : "outline"} onClick={() => move(to)} disabled={pending}>
                {MOVE_LABEL(state, to)}
              </Button>
            ))}
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {requireCode && state !== "draft" && (
        <div className="grid gap-2 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Access codes</h3>
          <p className="text-xs text-muted-foreground">
            Each code works once and is tied to the first student who uses it. Only a hash is stored, so copy them now.
          </p>
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={500} className="w-24" value={n} onChange={(e) => setN(e.target.value)} aria-label="How many codes" />
            <Button variant="outline" onClick={generate} disabled={pending}>
              Generate codes
            </Button>
          </div>
          {codes && (
            <textarea
              readOnly
              aria-label="Generated codes"
              className="h-32 w-full rounded-md border bg-muted/40 p-2 font-mono text-sm"
              value={codes.join("\n")}
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
        </div>
      )}
    </div>
  );
}
