"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { saveExamAction, unpublishExamAction } from "@/app/teach/actions";
import { IssueList } from "@/components/authoring/issue-list";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AttemptPoolItem } from "@/engine/attempt";
import { estimateOdds } from "@/engine/authoring/simulate";
import { summarizeBlueprint } from "@/engine/authoring/summary";
import { RELEASE_LABELS, type ExamSettings } from "@/engine/exam";
import { checkBlueprint } from "@/engine/selection/check";
import { questionLabel } from "@/lib/question-label";
import { BlueprintEditor } from "./blueprint-editor";
import { PoolTable } from "./pool-table";
import { SamplePanel } from "./sample-panel";
import type { BuilderExam, BuilderTopic } from "./types";

type SaveState = { kind: "saved" } | { kind: "saving" } | { kind: "dirty" } | { kind: "error"; text: string };

export function ExamBuilder({
  exam,
  topics,
  pool,
}: {
  exam: BuilderExam;
  topics: BuilderTopic[];
  /** Active questions in this exam's course. */
  pool: AttemptPoolItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(exam.title);
  const [description, setDescription] = useState(exam.description);
  const [blueprint, setBlueprint] = useState(exam.blueprint);
  const [settings, setSettings] = useState(exam.settings);

  const locked = exam.state !== "draft";
  const current = JSON.stringify({ title, description, blueprint, settings });
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify({ title: exam.title, description: exam.description, blueprint: exam.blueprint, settings: exam.settings }),
  );
  const [save, setSave] = useState<SaveState>({ kind: "saved" });
  const dirty = current !== savedSnapshot;

  // Drafts save themselves a moment after you stop typing, so moving to
  // another tab never loses work.
  useEffect(() => {
    if (locked || !dirty) return;
    const t = setTimeout(async () => {
      if (!title.trim()) return setSave({ kind: "error", text: "Give the exam a title to save it." });
      setSave({ kind: "saving" });
      const snapshot = current;
      const r = await saveExamAction({ id: exam.id, title, description: description.trim() || null, blueprint, settings });
      if (r.ok) {
        setSavedSnapshot(snapshot);
        setSave({ kind: "saved" });
      } else setSave({ kind: "error", text: r.error });
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `current` captures every field
  }, [current, locked]);

  useEffect(() => {
    if (!dirty || locked) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, locked]);

  const topicNames = useMemo(() => Object.fromEntries(topics.map((t) => [t.id, t.name])), [topics]);
  const questionNames = useMemo(
    () => Object.fromEntries(pool.map((q) => [q.id, questionLabel(q.def, 80)])),
    [pool],
  );
  const usedTopics = useMemo(() => new Set(blueprint.sections.map((s) => s.topicId)), [blueprint]);
  const drawablePool = useMemo(() => pool.filter((q) => usedTopics.has(q.topicId)), [pool, usedTopics]);

  const summary = summarizeBlueprint(blueprint, pool, topicNames);
  const issues = checkBlueprint(blueprint, pool, topicNames);

  // The odds run the real selector 1,000 times; defer so typing stays snappy.
  const deferredBlueprint = useDeferredValue(blueprint);
  const odds = useMemo(() => estimateOdds(deferredBlueprint, pool, 1000), [deferredBlueprint, pool]);

  const setSetting = <K extends keyof ExamSettings>(key: K, value: ExamSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const unpublish = () =>
    start(async () => {
      const r = await unpublishExamAction(exam.id);
      if (!r.ok) return setError(r.error);
      setError(null);
      router.refresh();
    });

  return (
    <div className="grid gap-12">
      {locked ? (
        <Notice>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex-1">
              Published and locked to {exam.lockedCount} question {exam.lockedCount === 1 ? "version" : "versions"}. Later edits to
              those questions won’t change this exam.
            </span>
            {exam.state === "scheduled" && (
              <Button variant="outline" size="sm" onClick={unpublish} disabled={pending}>
                Back to draft
              </Button>
            )}
          </div>
          {error && <p className="mt-2 text-destructive">{error}</p>}
        </Notice>
      ) : null}

      <section className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold tracking-tight">Details</h2>
          {!locked && <SaveIndicator state={dirty && save.kind === "saved" ? { kind: "dirty" } : save} />}
        </div>
        <Field label="Title">
          <Input value={title} disabled={locked} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description" hint="Optional. Students read this before they start.">
          <Textarea value={description} disabled={locked} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
      </section>

      <section aria-label="What each student gets" className="rounded-lg border p-5">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">What each student gets</h2>
        <div className="grid gap-1 text-base text-pretty">
          {summary.sentences.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
          {settings.timeLimitMinutes !== null && <p>They have {settings.timeLimitMinutes} minutes.</p>}
        </div>
      </section>

      <BuilderSection title="Blueprint" hint="How many questions to draw from each topic. Every student gets their own random draw.">
        <BlueprintEditor blueprint={blueprint} onChange={setBlueprint} topics={topics} pool={pool} disabled={locked} />
        <IssueList issues={issues} empty={blueprint.sections.length ? "Every section has enough questions." : undefined} />
      </BuilderSection>

      <BuilderSection title="Questions in play" hint="Everything the blueprint can draw, and how often each one appears.">
        <PoolTable pool={drawablePool} topicNames={topicNames} questionNames={questionNames} odds={odds} />
      </BuilderSection>

      <BuilderSection title="Sample student" hint="Enter any seed to see one student’s exact exam, and why each question was chosen.">
        <SamplePanel blueprint={blueprint} pool={drawablePool} topicNames={topicNames} questionNames={questionNames} />
      </BuilderSection>

      <BuilderSection title="Rules">
        <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-4">
            <Field label="Time limit (minutes)" hint="Blank for no limit. The server keeps the time.">
              <Input
                type="number"
                min={1}
                value={settings.timeLimitMinutes ?? ""}
                onChange={(e) =>
                  setSetting("timeLimitMinutes", e.target.value === "" ? null : Math.max(1, Math.floor(Number(e.target.value)) || 1))
                }
              />
            </Field>
            <Field label="Attempts allowed">
              <Input
                type="number"
                min={1}
                value={settings.attemptsAllowed}
                onChange={(e) => setSetting("attemptsAllowed", Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              />
            </Field>
          </div>
          <div className="grid content-start gap-4">
            <Field label="When results are released, students see">
              <Select value={settings.release} onChange={(e) => setSetting("release", e.target.value as ExamSettings["release"])}>
                {Object.entries(RELEASE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid content-start gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-foreground" checked={settings.requireCode} onChange={(e) => setSetting("requireCode", e.target.checked)} />
                Require a single-use access code
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-foreground" checked={settings.oneWayNavigation} onChange={(e) => setSetting("oneWayNavigation", e.target.checked)} />
                One-way: no going back to earlier questions
              </label>
            </div>
          </div>
        </fieldset>
      </BuilderSection>

      {!locked && (
        <div className="flex items-center justify-end gap-3 border-t pt-6">
          <span className="text-sm text-muted-foreground">When the blueprint looks right, check it and publish.</span>
          <Button asChild variant="outline">
            <Link href={`/teach/exams/${exam.id}/verify`}>Verify →</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function BuilderSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text =
    state.kind === "saved" ? "All changes saved" : state.kind === "saving" ? "Saving…" : state.kind === "dirty" ? "Unsaved changes" : state.text;
  return (
    <span role="status" className={state.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
      {text}
    </span>
  );
}
