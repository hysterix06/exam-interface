"use client";

import { useMemo } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parseCloze } from "@/engine/cloze";
import type { QuestionTypeUi } from "../ui-types";
import type { ClozeDef, ClozeResponse } from "./core";

type StudentSegment =
  | { kind: "lit"; text: string }
  | { kind: "text" | "num"; id: string }
  | { kind: "select"; id: string; options: string[] };
type StudentInstance = { segments: StudentSegment[] };

const KIND_LABEL = { text: "text", num: "number", select: "dropdown" } as const;

export const clozeUi: QuestionTypeUi<ClozeDef, StudentInstance, ClozeResponse> = {
  id: "cloze",
  description: "A sentence with blanks: typed text, numbers with a margin, or dropdowns.",

  newDef: () => ({ template: "" }),

  Editor({ def, onChange }) {
    const parsed = useMemo(() => parseCloze(def.template), [def.template]);
    return (
      <div className="grid gap-5">
        <Field
          label="Sentence with blanks"
          hint={
            <>
              Write the sentence and put each blank in double braces.
              <br />
              Text: <code>{"{{text:Paris|paris}}"}</code> (any of the answers). Number:{" "}
              <code>{"{{num:4±0.1}}"}</code> or <code>{"{{num:100±5%}}"}</code>. Dropdown:{" "}
              <code>{"{{select:red|blue*|green}}"}</code> (star marks the correct one).
            </>
          }
        >
          <Textarea
            className="min-h-32 font-mono"
            value={def.template}
            onChange={(e) => onChange({ template: e.target.value })}
          />
        </Field>

        {parsed.errors.length > 0 ? (
          <div role="alert">
            <ul className="grid gap-1 text-sm text-destructive">
              {parsed.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="mb-2 font-medium">
              {parsed.blanks.length} {parsed.blanks.length === 1 ? "blank" : "blanks"}, each worth an equal share
            </p>
            <ol className="grid gap-1 text-muted-foreground">
              {parsed.blanks.map((b, i) => (
                <li key={b.id}>
                  Blank {i + 1} ({KIND_LABEL[b.kind]}):{" "}
                  {b.kind === "text"
                    ? b.accepted.join(" or ")
                    : b.kind === "num"
                      ? `${b.value}${b.abs ? ` ± ${b.abs}` : b.rel ? ` ± ${b.rel * 100}%` : " exactly"}`
                      : `${b.correct} (of ${b.options.length})`}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    const blanks = value?.blanks ?? {};
    const set = (id: string, v: string) => onChange?.({ blanks: { ...blanks, [id]: v } });
    let n = 0;
    return (
      <p className="text-base leading-10">
        {instance.segments.map((s, i) => {
          if (s.kind === "lit") return <span key={i} className="whitespace-pre-wrap">{s.text}</span>;
          n++;
          const label = `Blank ${n}`;
          return s.kind === "select" ? (
            <Select
              key={i}
              aria-label={label}
              className="mx-1 inline-block w-auto min-w-28 align-middle"
              value={blanks[s.id] ?? ""}
              disabled={readOnly}
              onChange={(e) => set(s.id, e.target.value)}
            >
              <option value="" disabled>
                Choose…
              </option>
              {s.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              key={i}
              aria-label={label}
              autoComplete="off"
              inputMode={s.kind === "num" ? "decimal" : undefined}
              className="mx-1 inline-block h-8 w-36 align-middle"
              value={blanks[s.id] ?? ""}
              readOnly={readOnly}
              onChange={(e) => set(s.id, e.target.value)}
            />
          );
        })}
      </p>
    );
  },
};
