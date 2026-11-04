"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { restoreVersionAction, saveQuestionAction } from "@/app/teach/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { questionLabel } from "@/lib/question-label";
import { getQuestionType } from "@/question-types/registry";
import { getQuestionTypeUi } from "@/question-types/ui-registry";
import { IssueList } from "./issue-list";
import { QuestionPreview } from "./question-preview";

export interface EditorTopic {
  id: string;
  name: string;
  courseTitle: string;
}

export interface EditorQuestion {
  id?: string;
  topicId: string;
  /** Omitted for a new question: the type's blank definition is used. */
  def?: unknown;
  weight: number;
  difficulty: number;
  points: number;
  tags: string[];
  groupKey: string | null;
  status: "draft" | "active" | "archived";
  version?: number;
}

export interface EditorVersion {
  version: number;
  createdAt: string;
  label: string;
}

export function QuestionEditor({
  typeId,
  topics,
  initial,
  versions = [],
}: {
  typeId: string;
  topics: EditorTopic[];
  initial: EditorQuestion;
  versions?: EditorVersion[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const type = getQuestionType(typeId);
  const { Editor } = getQuestionTypeUi(typeId);

  const [def, setDef] = useState<unknown>(() => initial.def ?? getQuestionTypeUi(typeId).newDef());
  const [topicId, setTopicId] = useState(initial.topicId);
  const [difficulty, setDifficulty] = useState(String(initial.difficulty));
  const [points, setPoints] = useState(String(initial.points));
  const [weight, setWeight] = useState(String(initial.weight));
  const [groupKey, setGroupKey] = useState(initial.groupKey ?? "");
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [status, setStatus] = useState(initial.status);

  const pointsNum = Number(points) || 0;

  // Live checks use the very same validation the server enforces on activate.
  const issues = useMemo(() => {
    const parsed = type.defSchema.safeParse(def);
    return parsed.success
      ? type.validateDef(parsed.data)
      : [{ severity: "blocking" as const, code: "malformed", message: "The question is incomplete." }];
  }, [type, def]);
  const blocked = issues.some((i) => i.severity === "blocking");

  const save = () =>
    start(async () => {
      const r = await saveQuestionAction({
        id: initial.id,
        topicId,
        type: typeId,
        def,
        weight: Number(weight),
        difficulty: Number(difficulty),
        points: Number(points),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        groupKey: groupKey.trim() || null,
        status,
      });
      if (!r.ok) return setMessage({ tone: "error", text: r.error });
      setMessage({ tone: "ok", text: `Saved as version ${r.version}.` });
      if (initial.id) router.refresh();
      else router.replace(`/teach/questions/${r.id}`);
    });

  const restore = (version: number) =>
    start(async () => {
      const r = await restoreVersionAction(initial.id!, version);
      if (!r.ok) return setMessage({ tone: "error", text: r.error });
      setMessage({ tone: "ok", text: `Restored version ${version} as version ${r.version}.` });
      router.refresh();
    });

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="grid content-start gap-8">
        <section className="grid gap-5">
          <Editor def={def} onChange={setDef} />
        </section>

        <section className="grid gap-4 border-t pt-6 sm:grid-cols-2">
          <Field label="Topic">
            <Select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.courseTitle}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" hint="Only active questions can be drawn into exams.">
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          <Field label="Difficulty" hint="Blueprints can ask for a mix, e.g. 2 easy and 3 hard.">
            <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="1">1 · Easy</option>
              <option value="2">2 · Medium</option>
              <option value="3">3 · Hard</option>
            </Select>
          </Field>
          <Field label="Points">
            <Input type="number" min={0} step="any" value={points} onChange={(e) => setPoints(e.target.value)} />
          </Field>
          <Field label="Weight" hint="How likely it is to be drawn compared with others in its topic. 1 is normal, 2 is twice as likely, 0 is never.">
            <Input type="number" min={0} step="any" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
          <Field label="Variant group (optional)" hint="Questions sharing a group name test the same idea; an exam draws at most one of them.">
            <Input value={groupKey} onChange={(e) => setGroupKey(e.target.value)} placeholder="e.g. mitosis-phases" />
          </Field>
          <Field label="Tags (optional)" hint="Comma-separated, e.g. recall, chapter-3." className="sm:col-span-2">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
        </section>

        <section className="grid gap-3 border-t pt-6">
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={pending || (status === "active" && blocked)}>
              {pending ? "Saving…" : "Save"}
            </Button>
            {status === "active" && blocked ? (
              <span className="text-sm text-muted-foreground">Fix the issues below to activate.</span>
            ) : null}
            {message ? (
              <span role="status" className={message.tone === "ok" ? "text-sm text-success" : "text-sm text-destructive"}>
                {message.text}
              </span>
            ) : null}
          </div>
          <IssueList issues={issues} empty="No issues. This question is ready to use." />
        </section>

        {versions.length > 0 && (
          <section className="border-t pt-6">
            <h2 className="mb-2 text-sm font-medium">Version history</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Exams use the version that was current when they were published, so edits never change a published
              exam. Restoring saves an old version as a new one.
            </p>
            <ul className="divide-y rounded-lg border text-sm">
              {versions.map((v) => (
                <li key={v.version} className="flex items-center gap-3 px-3 py-2">
                  <Badge tone={v.version === initial.version ? "brand" : "neutral"}>v{v.version}</Badge>
                  <span className="min-w-0 flex-1 truncate">{v.label}</span>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={v.createdAt}>
                    {new Date(v.createdAt).toLocaleString()}
                  </time>
                  {v.version !== initial.version && (
                    <Button variant="ghost" size="xs" disabled={pending} onClick={() => restore(v.version)}>
                      Restore
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Live preview · {type.label}
        </h2>
        <QuestionPreview typeId={typeId} def={def} points={pointsNum} />
        <p className="mt-3 truncate text-xs text-muted-foreground">{questionLabel(def)}</p>
      </div>
    </div>
  );
}
