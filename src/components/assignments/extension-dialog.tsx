"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setExtensionAction } from "@/app/teach/assignments/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusText } from "@/components/ui/notice";
import { fromLocalInput, toLocalInput } from "@/lib/datetime-local";

/** Give one student a later due date (or take it away). */
export function ExtensionDialog({ assignmentId, student, current, defaultDue }: { assignmentId: string; student: { id: string; name: string }; current: { dueAt: string; reason: string | null } | null; defaultDue: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState(toLocalInput(current?.dueAt ?? defaultDue));
  const [reason, setReason] = useState(current?.reason ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (dueAt: string | null) =>
    start(async () => {
      const r = await setExtensionAction({ assignmentId, userId: student.id, dueAt, reason });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {current ? "Change extension" : "Extend"}
        </Button>
      </DialogTrigger>
      <DialogContent title={`Extension for ${student.name}`} description="Their own due date. Late penalties, if any, count from it.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const iso = fromLocalInput(due);
            if (!iso) return setError("Pick a new due date.");
            run(iso);
          }}
        >
          <Field label="New due date">
            <Input type="datetime-local" required value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Reason (optional)" hint="Kept in the activity log; the student doesn’t see it.">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error && <StatusText ok={false}>{error}</StatusText>}
          <DialogFooter>
            {current && (
              <Button type="button" variant="ghost" className="mr-auto" disabled={pending} onClick={() => run(null)}>
                Remove extension
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
