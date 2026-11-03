"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { nextOptionId } from "../choice-ui";
import type { QuestionTypeUi } from "../ui-types";
import { type LongAnswerDef, type LongAnswerInstance, type LongAnswerResponse, wordCount } from "./core";

type StudentInstance = Pick<LongAnswerInstance, "stem" | "maxWords">;

export const longAnswerUi: QuestionTypeUi<LongAnswerDef, StudentInstance, LongAnswerResponse> = {
  id: "long-answer",
  description: "A written answer, marked by a person against a rubric checklist.",

  newDef: () => ({
    stem: "",
    rubric: [{ id: "c1", text: "", points: 1 }],
    maxWords: null,
    keywords: [],
  }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<LongAnswerDef>) => onChange({ ...def, ...patch });
    const setCriterion = (id: string, patch: Partial<LongAnswerDef["rubric"][number]>) =>
      set({ rubric: def.rubric.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    const total = def.rubric.reduce((s, c) => s + c.points, 0);

    return (
      <div className="grid gap-5">
        <Field label="Question">
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Rubric</span>
          <p className="text-xs text-muted-foreground">
            What earns marks. A grader ticks each criterion that is met; weights are scaled to the question&apos;s points
            {total > 0 ? ` (${def.rubric.length} criteria, ${total} rubric points).` : "."}
          </p>
          {def.rubric.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2">
              <Input value={c.text} placeholder={`Criterion ${i + 1}`} aria-label={`Criterion ${i + 1}`} onChange={(e) => setCriterion(c.id, { text: e.target.value })} />
              <Input
                className="w-20"
                type="number"
                min={0}
                step="any"
                aria-label={`Criterion ${i + 1} weight`}
                title="Weight"
                value={c.points}
                onChange={(e) => setCriterion(c.id, { points: Number(e.target.value) })}
              />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove criterion ${i + 1}`} onClick={() => set({ rubric: def.rubric.filter((x) => x.id !== c.id) })}>
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => set({ rubric: [...def.rubric, { id: nextOptionId(def.rubric.map((c) => ({ id: c.id, text: c.text }))), text: "", points: 1 }] })}>
              <Plus /> Add criterion
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Word limit (optional)" hint="Shown to students as a counter. Not enforced.">
            <Input
              type="number"
              min={1}
              value={def.maxWords ?? ""}
              onChange={(e) => set({ maxWords: e.target.value === "" ? null : Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
            />
          </Field>
          <Field label="Keywords to highlight (optional)" hint="Comma-separated. Helps the grader scan; never sets the score.">
            <Input
              value={def.keywords.join(", ")}
              onChange={(e) => set({ keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
            />
          </Field>
        </div>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    const text = value?.text ?? "";
    const words = wordCount(text);
    const over = instance.maxWords !== null && words > instance.maxWords;
    return (
      <div className="grid gap-3">
        <p className="whitespace-pre-wrap text-base">{instance.stem}</p>
        <Textarea
          aria-label="Your answer"
          className="min-h-48"
          value={text}
          readOnly={readOnly}
          onChange={(e) => onChange?.({ text: e.target.value })}
        />
        <p className={`text-xs tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}>
          {words} {words === 1 ? "word" : "words"}
          {instance.maxWords !== null ? ` of ${instance.maxWords}` : ""}
        </p>
      </div>
    );
  },
};
