"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionTypeUi } from "../ui-types";
import type { ShortAnswerDef, ShortAnswerInstance, ShortAnswerResponse } from "./core";

type StudentInstance = Omit<ShortAnswerInstance, "match">;
type Match = ShortAnswerDef["match"];

const BLANK: Record<Match["kind"], Match> = {
  text: { kind: "text", accepted: [""], caseSensitive: false, collapseWhitespace: true },
  regex: { kind: "regex", pattern: "", caseSensitive: false, example: "" },
  numeric: { kind: "numeric", value: 0, tolerance: {} },
};

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="accent-foreground" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export const shortAnswerUi: QuestionTypeUi<ShortAnswerDef, StudentInstance, ShortAnswerResponse> = {
  id: "short-answer",
  description: "A typed answer, checked against accepted text, a pattern, or a number with tolerance.",

  newDef: () => ({ stem: "", match: BLANK.text }),

  Editor({ def, onChange }) {
    const m = def.match;
    const setMatch = (match: Match) => onChange({ ...def, match });
    return (
      <div className="grid gap-5">
        <Field label="Question">
          <Textarea value={def.stem} onChange={(e) => onChange({ ...def, stem: e.target.value })} />
        </Field>

        <Field
          label="How is the answer checked?"
          hint={
            m.kind === "text"
              ? "The student's text must match one of your accepted answers."
              : m.kind === "regex"
                ? "For answers with many valid spellings. Use a regular expression."
                : "A number, with an allowed margin of error and optional units."
          }
        >
          <Select
            value={m.kind}
            onChange={(e) => setMatch(BLANK[e.target.value as Match["kind"]])}
          >
            <option value="text">Accepted answers</option>
            <option value="numeric">A number</option>
            <option value="regex">A pattern (regex)</option>
          </Select>
        </Field>

        {m.kind === "text" && (
          <>
            <Field label="Accepted answers" hint="One per line. Any of them is marked correct.">
              <Textarea
                value={m.accepted.join("\n")}
                onChange={(e) => setMatch({ ...m, accepted: e.target.value.split("\n") })}
              />
            </Field>
            <div className="grid gap-2">
              <Check label="Case-sensitive" checked={m.caseSensitive} onChange={(caseSensitive) => setMatch({ ...m, caseSensitive })} />
              <Check label="Ignore extra spaces" checked={m.collapseWhitespace} onChange={(collapseWhitespace) => setMatch({ ...m, collapseWhitespace })} />
            </div>
          </>
        )}

        {m.kind === "regex" && (
          <>
            <Field label="Pattern" hint="Example: ^(color|colour)$ accepts either spelling.">
              <Input className="font-mono" value={m.pattern} onChange={(e) => setMatch({ ...m, pattern: e.target.value })} />
            </Field>
            <Field label="Sample correct answer" hint="Must match the pattern. It is shown as the answer key.">
              <Input value={m.example} onChange={(e) => setMatch({ ...m, example: e.target.value })} />
            </Field>
            <Check label="Case-sensitive" checked={m.caseSensitive} onChange={(caseSensitive) => setMatch({ ...m, caseSensitive })} />
          </>
        )}

        {m.kind === "numeric" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Correct value">
              <Input
                type="number"
                step="any"
                value={m.value}
                onChange={(e) => setMatch({ ...m, value: Number(e.target.value) })}
              />
            </Field>
            <Field label="Units (optional)" hint="Comma-separated, e.g. kg, kilograms. Leave empty if none.">
              <Input
                value={(m.units ?? []).join(", ")}
                onChange={(e) => {
                  const units = e.target.value.split(",").map((u) => u.trim()).filter(Boolean);
                  setMatch({ ...m, units: units.length ? units : undefined });
                }}
              />
            </Field>
            <Field label="Allowed error (absolute)" hint="Accept the value ± this much. Blank = exact.">
              <Input
                type="number"
                step="any"
                min={0}
                value={m.tolerance.abs ?? ""}
                onChange={(e) =>
                  setMatch({ ...m, tolerance: { ...m.tolerance, abs: e.target.value === "" ? undefined : Number(e.target.value) } })
                }
              />
            </Field>
            <Field label="Allowed error (%)" hint="Accept ± this percent of the value. The larger of the two limits applies.">
              <Input
                type="number"
                step="any"
                min={0}
                value={m.tolerance.rel === undefined ? "" : m.tolerance.rel * 100}
                onChange={(e) =>
                  setMatch({ ...m, tolerance: { ...m.tolerance, rel: e.target.value === "" ? undefined : Number(e.target.value) / 100 } })
                }
              />
            </Field>
          </div>
        )}
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    return (
      <div className="grid gap-4">
        <p className="whitespace-pre-wrap text-base">{instance.stem}</p>
        <Input
          aria-label="Your answer"
          autoComplete="off"
          placeholder="Type your answer"
          value={value?.text ?? ""}
          readOnly={readOnly}
          onChange={(e) => onChange?.({ text: e.target.value })}
        />
      </div>
    );
  },
};
