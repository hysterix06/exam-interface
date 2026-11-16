"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { overrideGradeAction } from "@/app/teach/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusText } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { fmtNum } from "@/engine/grading/format";

/** Set one answer's score by hand. The reason goes in the audit log and on the breakdown. */
export function OverrideScore({ attemptItemId, position, score, max }: { attemptItemId: string; position: number; score: number; max: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="print:hidden">
          Change score
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Change the score for question ${position + 1}`}
        description={`Now ${fmtNum(score)} of ${fmtNum(max)}. The grader's explanation stays; one line is added saying who changed it and why.`}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await overrideGradeAction({ attemptItemId, score: Number(f.get("score")), reason: String(f.get("reason") ?? "") });
              if (!r.ok) return setError(r.error);
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <Field label={`New score (0 to ${fmtNum(max)})`}>
            <Input name="score" type="number" inputMode="decimal" step="any" min={0} max={max} defaultValue={score} required />
          </Field>
          <Field label="Reason">
            <Textarea name="reason" required placeholder="e.g. Accepted an equivalent wording after a student query." />
          </Field>
          {error && <StatusText ok={false}>{error}</StatusText>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              Save score
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
