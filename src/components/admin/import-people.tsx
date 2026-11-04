"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importPeopleAction, previewImportAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { StatusText } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toCsv } from "@/engine/csv";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/roles";
import type { RosterParse } from "@/lib/roster";
import type { ImportOutcome } from "@/server/admin/people";

type Step = { kind: "edit" } | { kind: "preview"; parse: RosterParse } | { kind: "done"; outcomes: ImportOutcome[] };

const STATUS: Record<ImportOutcome["status"], string> = {
  created: "Account created",
  enrolled: "Already had an account; enrolled",
  exists: "Already had an account",
  failed: "Not added",
};

/** Paste a class list, check exactly who'll be added, then add them in one go. */
export function ImportPeople({ courses }: { courses: { id: string; title: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [courseId, setCourseId] = useState("");
  const [step, setStep] = useState<Step>({ kind: "edit" });
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setText("");
    setStep({ kind: "edit" });
    setError(null);
  };

  const download = (outcomes: ImportOutcome[]) => {
    const csv = toCsv([["Name", "Email", "Result", "One-time password"], ...outcomes.map((o) => [o.fullName ?? "", o.email, o.error ?? STATUS[o.status], o.password ?? ""])]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "new-accounts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Import list</Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-2xl"
        title="Import a list of people"
        description={step.kind === "edit" ? "One person per line: an email, or a name and email. Paste straight from a spreadsheet." : undefined}
      >
        {step.kind === "edit" && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => setStep({ kind: "preview", parse: await previewImportAction(text) }));
            }}
          >
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className="font-mono text-sm"
              placeholder={"Ada Lovelace, ada@school.edu\nalan@school.edu\nGrace Hopper, grace@school.edu, teacher"}
              aria-label="People to import"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role, unless a line says otherwise">
                <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Add them to">
                <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  <option value="">No course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending || !text.trim()}>
                Check list
              </Button>
            </DialogFooter>
          </form>
        )}

        {step.kind === "preview" && (
          <div className="grid gap-4">
            <p className="text-sm">
              {step.parse.rows.length} {step.parse.rows.length === 1 ? "person" : "people"} found
              {courseId ? <> to add to {courses.find((c) => c.id === courseId)?.title}</> : null}.
              {step.parse.errors.length > 0 && <span className="text-muted-foreground"> {step.parse.errors.length} lines will be skipped.</span>}
            </p>
            <div className="max-h-64 overflow-y-auto rounded-md border text-sm">
              <table className="w-full">
                <tbody>
                  {step.parse.rows.map((r) => (
                    <tr key={r.email} className="border-b last:border-b-0">
                      <td className="px-3 py-1.5">{r.fullName ?? <span className="text-muted-foreground">No name</span>}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.email}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{ROLE_LABELS[r.role ?? role]}</td>
                    </tr>
                  ))}
                  {step.parse.errors.map((e) => (
                    <tr key={`e${e.line}`} className="border-b text-destructive last:border-b-0">
                      <td className="px-3 py-1.5" colSpan={2}>
                        Line {e.line}: {e.text}
                      </td>
                      <td className="px-3 py-1.5 text-right">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <StatusText ok={false}>{error}</StatusText>}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep({ kind: "edit" })}>
                Back
              </Button>
              <Button
                disabled={pending || step.parse.rows.length === 0}
                onClick={() =>
                  start(async () => {
                    const r = await importPeopleAction({ text, defaultRole: role, courseId: courseId || null });
                    if (!r.ok) return setError(r.error);
                    setStep({ kind: "done", outcomes: r.outcomes });
                    router.refresh();
                  })
                }
              >
                {pending ? "Adding…" : `Add ${step.parse.rows.length} ${step.parse.rows.length === 1 ? "person" : "people"}`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step.kind === "done" && (
          <div className="grid gap-4">
            <p className="text-sm">
              {step.outcomes.filter((o) => o.status === "created").length} accounts created,{" "}
              {step.outcomes.filter((o) => o.status === "enrolled").length} existing people enrolled,{" "}
              {step.outcomes.filter((o) => o.status === "failed").length} not added.
            </p>
            {step.outcomes.some((o) => o.password) && (
              <p className="text-sm text-muted-foreground">Download the one-time passwords now. They won’t be shown again.</p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-md border text-sm">
              <table className="w-full">
                <tbody>
                  {step.outcomes.map((o) => (
                    <tr key={o.email} className="border-b last:border-b-0">
                      <td className="px-3 py-1.5">{o.email}</td>
                      <td className={o.status === "failed" ? "px-3 py-1.5 text-destructive" : "px-3 py-1.5 text-muted-foreground"}>{o.error ?? STATUS[o.status]}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{o.password ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => download(step.outcomes)}>
                Download CSV
              </Button>
              <DialogClose asChild>
                <Button>Done</Button>
              </DialogClose>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
