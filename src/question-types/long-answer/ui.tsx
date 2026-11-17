"use client";

import { withFormatHint } from "../hints";
import { Prose } from "@/components/ui/prose";
import { useId } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RubricEditor } from "../rubric-ui";
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

    return (
      <div className="grid gap-5">
        <Field label="Question" hint={withFormatHint()}>
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>

        <RubricEditor rubric={def.rubric} onChange={(rubric) => set({ rubric })} />

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
    const stemId = useId();
    const text = value?.text ?? "";
    const words = wordCount(text);
    const over = instance.maxWords !== null && words > instance.maxWords;
    return (
      <div className="grid gap-3">
        <Prose id={stemId} className="text-base">{instance.stem}</Prose>
        <Textarea
          aria-label="Your answer"
          aria-describedby={stemId}
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
