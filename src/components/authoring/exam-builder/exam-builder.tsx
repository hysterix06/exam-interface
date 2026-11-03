"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { publishExamAction, saveExamAction, unpublishExamAction } from "@/app/author/exams/actions";
import { IssueList } from "@/components/authoring/issue-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { VerifyPanel } from "./verify-panel";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t pt-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="mt-1 max-w-prose text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

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
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [title, setTitle] = useState(exam.title);
  const [description, setDescription] = useState(exam.description);
  const [blueprint, setBlueprint] = useState(exam.blueprint);
  const [settings, setSettings] = useState(exam.settings);

  const locked = exam.state !== "draft";
  const saved = JSON.stringify({ title: exam.title, description: exam.description, blueprint: exam.blueprint, settings: exam.settings });
  const dirty = saved !== JSON.stringify({ title, description, blueprint, settings });

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

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? { tone: "ok", text: ok } : { tone: "error", text: r.error ?? "Something went wrong." });
      if (r.ok) router.refresh();
    });

  const save = () =>
    run(
      () => saveExamAction({ id: exam.id, title, description: description.trim() || null, blueprint, settings }),
      "Saved.",
    );

  return (
    <div className="grid gap-10">
      <header className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={locked ? "signal" : "neutral"}>{exam.state}</Badge>
          <span className="text-sm text-muted-foreground">{exam.courseTitle}</span>
          <div className="ml-auto flex items-center gap-2">
            {message ? (
              <span role="status" className={message.tone === "ok" ? "text-sm text-success" : "text-sm text-destructive"}>
                {message.text}
              </span>
            ) : null}
            {!locked && (
              <>
                <Button variant="outline" onClick={save} disabled={pending || !dirty}>
                  {dirty ? "Save changes" : "Saved"}
                </Button>
                <Button
                  onClick={() => run(() => publishExamAction(exam.id), "Published. Questions are locked at their current versions.")}
                  disabled={pending || dirty || summary.questionCount === 0}
                  title={dirty ? "Save first" : undefined}
                >
                  Publish
                </Button>
              </>
            )}
            {exam.state === "scheduled" && (
              <Button variant="outline" onClick={() => run(() => unpublishExamAction(exam.id), "Back to draft.")} disabled={pending}>
                Unpublish
              </Button>
            )}
          </div>
        </div>
        {locked && (
          <p className="rounded-md border border-signal/30 px-3 py-2 text-sm">
            This exam is published and locked to {exam.lockedCount} question {exam.lockedCount === 1 ? "version" : "versions"}.
            Edits to those questions won’t change it.
          </p>
        )}
        <Field label="Title">
          <Input value={title} disabled={locked} onChange={(e) => setTitle(e.target.value)} className="h-11 text-lg font-semibold" />
        </Field>
        <Field label="Description (optional)" hint="Students see this before they enter.">
          <Textarea value={description} disabled={locked} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </header>

      <section aria-label="What each student gets" className="rounded-lg border bg-muted/40 p-5">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">What each student gets</h2>
        <div className="grid gap-1 text-base">
          {summary.sentences.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
          {settings.timeLimitMinutes !== null && <p>They have {settings.timeLimitMinutes} minutes.</p>}
        </div>
      </section>

      <Section
        title="Blueprint"
        hint="Say how many questions to draw from each topic. Each student gets a different random draw, weighted by each question's weight."
      >
        <BlueprintEditor blueprint={blueprint} onChange={setBlueprint} topics={topics} pool={pool} disabled={locked} />
        <IssueList issues={issues} empty={blueprint.sections.length ? "Every section has enough questions." : undefined} />
      </Section>

      <Section
        title="Questions in play"
        hint="Everything the blueprint can draw. “Appears on” is measured by running the real selector 1,000 times."
      >
        <PoolTable pool={drawablePool} topicNames={topicNames} questionNames={questionNames} odds={odds} />
      </Section>

      <Section title="Sample student" hint="Pick any seed to see one student's exact exam and why those questions were chosen.">
        <SamplePanel blueprint={blueprint} pool={drawablePool} topicNames={topicNames} questionNames={questionNames} />
      </Section>

      <Section title="Settings">
        <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
          <Field label="Time limit (minutes)" hint="Leave blank for no limit. The server runs the clock.">
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
          <Field label="After results are released, students see">
            <Select value={settings.release} onChange={(e) => setSetting("release", e.target.value as ExamSettings["release"])}>
              {Object.entries(RELEASE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid content-start gap-3 pt-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-foreground" checked={settings.requireCode} onChange={(e) => setSetting("requireCode", e.target.checked)} />
              Require a single-use access code to enter
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-foreground" checked={settings.oneWayNavigation} onChange={(e) => setSetting("oneWayNavigation", e.target.checked)} />
              One-way navigation (no going back)
            </label>
          </div>
        </fieldset>
      </Section>

      <Section
        title="Verify before publishing"
        hint="Nothing goes live until these pass. The same checks run on the server when you press Publish."
      >
        <VerifyPanel
          blueprint={blueprint}
          settings={settings}
          pool={pool}
          topicNames={topicNames}
          questionNames={questionNames}
        />
      </Section>
    </div>
  );
}
