"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { markSubmissionAction } from "@/app/teach/assignments/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusText } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { gradeSubmission } from "@/engine/assignments/grade";
import type { DueLatePolicy } from "@/engine/assignments/late";
import { fmtNum } from "@/engine/grading/format";
import type { RubricCriterion } from "@/engine/grading/rubric";

/**
 * Rubric ticks (keys 1–9 toggle, Enter saves and moves on), feedback, and an
 * optional hand-set total with a reason. The score updates as you tick, worked
 * out by the same pure grader the server uses.
 */
export function MarkingForm({
  assignmentId,
  submissionId,
  rubric,
  points,
  lateMinutes,
  late,
  initial,
  nextHref,
}: {
  assignmentId: string;
  submissionId: string;
  rubric: RubricCriterion[];
  points: number;
  lateMinutes: number;
  late: DueLatePolicy;
  initial: { ticked: string[]; score: number | null; feedback: string | null; excused: boolean; overrideReason: string | null } | null;
  nextHref: string | null;
}) {
  const router = useRouter();
  const [ticked, setTicked] = useState<string[]>(initial?.ticked ?? []);
  const [score, setScore] = useState(initial && rubric.length === 0 ? String(initial.score ?? "") : "");
  const [feedback, setFeedback] = useState(initial?.feedback ?? "");
  const [excused, setExcused] = useState(initial?.excused ?? false);
  const [adjusting, setAdjusting] = useState(!!initial?.overrideReason);
  const [adjust, setAdjust] = useState({ score: initial?.overrideReason ? String(initial.score) : "", reason: initial?.overrideReason ?? "" });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const preview = gradeSubmission({ rubric, points, ticked, score: Number(score) || 0, lateMinutes, late });
  const total = adjusting && adjust.score !== "" ? Number(adjust.score) : preview.score;

  const save = (goNext: boolean) =>
    start(async () => {
      const r = await markSubmissionAction(assignmentId, {
        submissionId,
        ticked,
        score: rubric.length === 0 ? Number(score) || 0 : undefined,
        feedback,
        excused,
        adjust: adjusting && adjust.score !== "" ? { score: Number(adjust.score), reason: adjust.reason } : null,
      });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: `Saved: ${fmtNum(r.score)} / ${fmtNum(points)}.` });
      if (goNext && nextHref) router.push(nextHref);
      else router.refresh();
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && rubric[n - 1]) {
        const id = rubric[n - 1].id;
        setTicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rubric]);

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
    >
      {rubric.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Rubric</legend>
          <ul className="grid gap-1.5">
            {rubric.map((c, i) => {
              const line = preview.lines[i];
              return (
                <li key={c.id}>
                  <label className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm has-checked:border-foreground/40">
                    <input type="checkbox" className="mt-0.5" checked={ticked.includes(c.id)} onChange={(e) => setTicked(e.target.checked ? [...ticked, c.id] : ticked.filter((x) => x !== c.id))} />
                    <span className="flex-1">
                      <kbd className="mr-2 text-xs text-muted-foreground">{i + 1}</kbd>
                      {c.text}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{fmtNum(Math.round(line.max * 100) / 100)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : (
        <Field label={`Score out of ${fmtNum(points)}`}>
          <Input inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} />
        </Field>
      )}

      {preview.latePenalty && <p className="text-sm text-warning">{preview.latePenalty.explanation}</p>}

      <Field label="Feedback for the student" hint="Markdown works. Shown with the grade once you release grades.">
        <Textarea rows={5} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </Field>

      <div className="grid gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={adjusting} onChange={(e) => setAdjusting(e.target.checked)} /> Set the total by hand
        </label>
        {adjusting && (
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <Input aria-label="Total" inputMode="decimal" value={adjust.score} onChange={(e) => setAdjust({ ...adjust, score: e.target.value })} placeholder={fmtNum(preview.score)} />
            <Input aria-label="Reason" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} placeholder="Why (the student sees this)" />
          </div>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={excused} onChange={(e) => setExcused(e.target.checked)} /> Excused (left out of the course grade)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <p className="mr-auto text-lg font-semibold tabular-nums">
          {fmtNum(total)} <span className="text-sm font-normal text-muted-foreground">/ {fmtNum(points)}</span>
        </p>
        {msg && <StatusText ok={msg.ok}>{msg.text}</StatusText>}
        <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
          Save
        </Button>
        {nextHref && (
          <Button type="submit" disabled={pending}>
            Save & next
          </Button>
        )}
      </div>
    </form>
  );
}
