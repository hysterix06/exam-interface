"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCodesAction, publishExamAction, setExamStateAction, startPreviewAction } from "@/app/teach/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusText } from "@/components/ui/notice";
import { type ExamStateName, nextStates } from "@/engine/exam-state";

/** "Take it as a student": a real attempt, flagged as a preview and never counted. */
export function PreviewButton({ examId, disabled, variant = "outline" }: { examId: string; disabled?: boolean; variant?: "outline" | "default" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button
        variant={variant}
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            const r = await startPreviewAction(examId);
            if (!r.ok) return setError(r.error);
            router.push(`/attempt/${r.attemptId}`);
          })
        }
      >
        {pending ? "Building your copy…" : "Take it as a student"}
      </Button>
      {error && <StatusText ok={false}>{error}</StatusText>}
    </span>
  );
}

export function PublishButton({ examId, disabled }: { examId: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button
        className="bg-brand text-brand-foreground hover:bg-brand/90"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            const r = await publishExamAction(examId);
            if (!r.ok) return setError(r.error);
            router.push(`/teach/exams/${examId}/run`);
          })
        }
      >
        {pending ? "Publishing…" : "Publish"}
      </Button>
      {error && <StatusText ok={false}>{error}</StatusText>}
    </span>
  );
}

const MOVES: Partial<Record<ExamStateName, { label: string; confirm?: string; primary?: boolean }>> = {
  open: { label: "Open now", primary: true },
  closed: { label: "Close exam", confirm: "Students still in the exam are submitted with what they’ve saved, and nobody new can start." },
  graded: { label: "Mark as graded" },
  released: { label: "Release results", confirm: "Students will see their results, as set in the exam’s rules. You can close it again to hide them." },
};

/** The next lifecycle steps for an exam. Anything with consequences asks first. */
export function StateControls({ examId, state }: { examId: string; state: ExamStateName }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const move = (to: ExamStateName) =>
    start(async () => {
      const r = await setExamStateAction(examId, to);
      if (!r.ok) return setError(r.error);
      setError(null);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {nextStates(state).map((to) => {
        const m = MOVES[to] ?? { label: to };
        const label = to === "open" && state !== "scheduled" ? "Reopen" : m.label;
        const variant = m.primary && state === "scheduled" ? "default" : "outline";
        if (!m.confirm) {
          return (
            <Button key={to} variant={variant} onClick={() => move(to)} disabled={pending}>
              {label}
            </Button>
          );
        }
        return (
          <Dialog key={to}>
            <DialogTrigger asChild>
              <Button variant={variant} disabled={pending}>
                {label}
              </Button>
            </DialogTrigger>
            <DialogContent title={`${label}?`} description={m.confirm}>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button onClick={() => move(to)}>{label}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })}
      {error && <StatusText ok={false}>{error}</StatusText>}
    </div>
  );
}

/** Single-use access codes. Only hashes are stored, so they're shown once. */
export function CodeGenerator({ examId }: { examId: string }) {
  const [pending, start] = useTransition();
  const [n, setN] = useState("30");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createCodesAction(examId, Number(n));
            if (!r.ok) return setError(r.error);
            setError(null);
            setCopied(false);
            setCodes(r.codes);
          });
        }}
      >
        <Input type="number" min={1} max={500} className="w-24" value={n} onChange={(e) => setN(e.target.value)} aria-label="How many codes" />
        <Button type="submit" variant="outline" disabled={pending}>
          Generate codes
        </Button>
        {error && <StatusText ok={false}>{error}</StatusText>}
      </form>
      {codes && (
        <div className="grid gap-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Copy these now. They won’t be shown again.</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(codes.join("\n"));
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy all"}
            </Button>
          </div>
          <textarea
            readOnly
            aria-label="Generated codes"
            className="h-40 w-full max-w-xs rounded-md border bg-muted/40 p-2 font-mono text-sm"
            value={codes.join("\n")}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}
