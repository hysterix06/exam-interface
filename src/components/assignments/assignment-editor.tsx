"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveAssignmentAction } from "@/app/teach/assignments/actions";
import { Button } from "@/components/ui/button";
import { ButtonTabs } from "@/components/ui/button-tabs";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusText } from "@/components/ui/notice";
import { Prose } from "@/components/ui/prose";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { describeDueLatePolicy } from "@/engine/assignments/late";
import { FILE_KIND_LABEL, SUBMISSION_FILE_KINDS, type AssignmentSettings } from "@/engine/assignments/settings";
import type { RubricCriterion } from "@/engine/grading/rubric";
import { fmtNum } from "@/engine/grading/format";
import { fromLocalInput, toLocalInput } from "@/lib/datetime-local";

export interface EditableAssignment {
  id: string;
  title: string;
  instructions: string | null;
  opensAt: string | null;
  dueAt: string | null;
  points: number;
  categoryId: string | null;
  settings: AssignmentSettings;
  rubric: RubricCriterion[];
}

const newId = () => Math.random().toString(36).slice(2, 10);

export function AssignmentEditor({ initial, categories, hasMarks }: { initial: EditableAssignment; categories: { id: string; name: string }[]; hasMarks: boolean }) {
  const router = useRouter();
  const [a, setA] = useState({
    ...initial,
    instructions: initial.instructions ?? "",
    opensAt: toLocalInput(initial.opensAt),
    dueAt: toLocalInput(initial.dueAt),
    points: String(initial.points),
    rubric: initial.rubric.map((c) => ({ ...c, points: String(c.points) })),
  });
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) => {
    setA((x) => ({ ...x, [k]: v }));
    setDirty(true);
    setMsg(null);
  };
  const setS = (patch: Partial<AssignmentSettings>) => set("settings", { ...a.settings, ...patch });
  const late = a.settings.late;
  const rubricTotal = a.rubric.reduce((s, c) => s + (Number(c.points) || 0), 0);

  const save = () =>
    start(async () => {
      const r = await saveAssignmentAction({
        id: a.id,
        title: a.title,
        instructions: a.instructions,
        opensAt: fromLocalInput(a.opensAt),
        dueAt: fromLocalInput(a.dueAt),
        points: Number(a.points),
        categoryId: a.categoryId || null,
        settings: a.settings,
        rubric: a.rubric.map((c) => ({ id: c.id, text: c.text, points: Number(c.points) || 0 })),
      });
      setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
      if (r.ok) {
        setDirty(false);
        router.refresh();
      }
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Section title="The task">
        <div className="grid gap-4">
          <Field label="Title">
            <Input value={a.title} onChange={(e) => set("title", e.target.value)} required />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium">Instructions</p>
            <ButtonTabs
              label="Instructions editor"
              value={tab}
              onChange={setTab}
              options={[
                { value: "write", label: "Write" },
                { value: "preview", label: "Preview" },
              ]}
            />
            <div className="mt-3">
              {tab === "write" ? (
                <Textarea aria-label="Instructions" rows={12} className="font-mono text-sm" value={a.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="What to do, how it's marked, what to hand in. Markdown and $maths$ work." />
              ) : a.instructions.trim() ? (
                <div className="rounded-md border p-5">
                  <Prose>{a.instructions}</Prose>
                </div>
              ) : (
                <p className="rounded-md border p-5 text-sm text-muted-foreground">Nothing to preview yet.</p>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section title="When and how much">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Opens" hint="Leave empty to open as soon as it’s published.">
            <Input type="datetime-local" value={a.opensAt} onChange={(e) => set("opensAt", e.target.value)} />
          </Field>
          <Field label="Due">
            <Input type="datetime-local" value={a.dueAt} onChange={(e) => set("dueAt", e.target.value)} />
          </Field>
          <Field label="Points" hint={hasMarks ? "Marks already given keep the points they were marked out of." : undefined}>
            <Input inputMode="decimal" value={a.points} onChange={(e) => set("points", e.target.value)} />
          </Field>
          <Field label="Counts towards">
            <Select value={a.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value || null)}>
              <option value="">Not counted in the course grade</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Handing in">
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={a.settings.allowText} onChange={(e) => setS({ allowText: e.target.checked })} /> Typed answer
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={a.settings.allowFiles} onChange={(e) => setS({ allowFiles: e.target.checked })} /> Files
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={a.settings.resubmit} onChange={(e) => setS({ resubmit: e.target.checked })} /> Students may hand in again (the newest is marked)
            </label>
          </div>
          {a.settings.allowFiles && (
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <Field label="Up to">
                <Select value={a.settings.maxFiles} onChange={(e) => setS({ maxFiles: Number(e.target.value) })}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "file" : "files"}
                    </option>
                  ))}
                </Select>
              </Field>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Accepted</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  {SUBMISSION_FILE_KINDS.map((k) => (
                    <label key={k} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={a.settings.accept.includes(k)}
                        onChange={(e) => {
                          const next = e.target.checked ? [...a.settings.accept, k] : a.settings.accept.filter((x) => x !== k);
                          if (next.length) setS({ accept: next });
                        }}
                      />
                      {FILE_KIND_LABEL[k]}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Up to 10 MB each. Files are checked by their contents, not their name.</p>
              </fieldset>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Late work">
              <Select
                value={late.mode}
                onChange={(e) => setS({ late: e.target.value === "accept" ? { mode: "accept", penaltyPercentPerDay: 10, maxPenaltyPercent: 50, closesAfterDays: 7 } : { mode: "reject" } })}
              >
                <option value="reject">Not accepted</option>
                <option value="accept">Accepted with a penalty</option>
              </Select>
            </Field>
            {late.mode === "accept" && (
              <>
                <Field label="% off per day">
                  <Input inputMode="decimal" value={late.penaltyPercentPerDay} onChange={(e) => setS({ late: { ...late, penaltyPercentPerDay: Number(e.target.value) || 0 } })} />
                </Field>
                <Field label="At most %">
                  <Input inputMode="decimal" value={late.maxPenaltyPercent} onChange={(e) => setS({ late: { ...late, maxPenaltyPercent: Number(e.target.value) || 0 } })} />
                </Field>
                <Field label="For up to (days)">
                  <Input inputMode="numeric" value={late.closesAfterDays} onChange={(e) => setS({ late: { ...late, closesAfterDays: Math.max(1, Math.round(Number(e.target.value) || 1)) } })} />
                </Field>
              </>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Students read: “{describeDueLatePolicy(late)}”</p>
        </div>
      </Section>

      <Section
        title="Rubric"
        description={`What you’ll tick when marking. Weights are relative and scaled to the ${fmtNum(Number(a.points) || 0)} points; students see the rubric before they hand in. Without a rubric you give a single score.`}
      >
        {a.rubric.length > 0 && (
          <ol className="mb-3 grid gap-2">
            {a.rubric.map((c, i) => (
              <li key={c.id} className="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
                <Input aria-label={`Criterion ${i + 1}`} value={c.text} placeholder="e.g. States a testable hypothesis" onChange={(e) => set("rubric", a.rubric.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                <Input aria-label={`Weight of criterion ${i + 1}`} inputMode="decimal" value={c.points} onChange={(e) => set("rubric", a.rubric.map((x, j) => (j === i ? { ...x, points: e.target.value } : x)))} />
                <div className="flex">
                  <Button type="button" variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => set("rubric", a.rubric.map((x, j) => (j === i - 1 ? a.rubric[i] : j === i ? a.rubric[i - 1] : x)))}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Move down" disabled={i === a.rubric.length - 1} onClick={() => set("rubric", a.rubric.map((x, j) => (j === i + 1 ? a.rubric[i] : j === i ? a.rubric[i + 1] : x)))}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove criterion ${i + 1}`} onClick={() => set("rubric", a.rubric.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="flex items-center gap-4">
          <Button type="button" variant="outline" size="sm" onClick={() => set("rubric", [...a.rubric, { id: newId(), text: "", points: "1" }])}>
            <Plus /> Add criterion
          </Button>
          {a.rubric.length > 0 && <span className="text-sm text-muted-foreground">{fmtNum(rubricTotal)} weight in all</span>}
        </div>
      </Section>

      <div className="sticky bottom-0 mt-10 flex items-center gap-4 border-t bg-background py-4">
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {msg ? <StatusText ok={msg.ok}>{msg.text}</StatusText> : dirty ? <span className="text-sm text-muted-foreground">Unsaved changes</span> : null}
      </div>
    </form>
  );
}
