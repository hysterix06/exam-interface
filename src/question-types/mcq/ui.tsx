"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChoiceList, OptionRows } from "../choice-ui";
import type { QuestionTypeUi } from "../ui-types";
import type { McqDef, McqInstance, McqResponse } from "./core";

type StudentInstance = Omit<McqInstance, "key" | "feedback">;

export const mcqUi: QuestionTypeUi<McqDef, StudentInstance, McqResponse> = {
  id: "mcq",
  description: "Pick one answer, or several. Options are shuffled per student.",

  newDef: () => ({
    stem: "",
    options: ["a", "b", "c", "d"].map((id) => ({ id, text: "", correct: false })),
    multiple: false,
    shuffle: true,
    scoring: "all-or-nothing",
    penalty: 0,
  }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<McqDef>) => onChange({ ...def, ...patch });
    const setCorrect = (id: string, correct: boolean) =>
      set({
        options: def.options.map((o) =>
          o.id === id ? { ...o, correct } : def.multiple ? o : { ...o, correct: false },
        ),
      });
    return (
      <div className="grid gap-5">
        <Field label="Question" hint="What the student reads. Plain text for now.">
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Options</span>
          <p className="text-xs text-muted-foreground">
            {def.multiple ? "Tick every correct option." : "Select the one correct option."}
          </p>
          <OptionRows
            options={def.options}
            onChange={(options) => set({ options })}
            makeOption={(id) => ({ id, text: "", correct: false })}
            mark={(o, i) => (
              <input
                type={def.multiple ? "checkbox" : "radio"}
                name="mcq-correct"
                aria-label={`Option ${i + 1} is correct`}
                className="accent-foreground"
                checked={o.correct}
                onChange={(e) => setCorrect(o.id, def.multiple ? e.target.checked : true)}
              />
            )}
            extra={(o, update) =>
              o.feedback !== undefined || o.correct ? (
                <Input
                  className="ml-6 h-8 w-[calc(100%-1.5rem)] text-xs"
                  placeholder="Optional feedback shown after results are released"
                  aria-label="Feedback for this option"
                  value={o.feedback ?? ""}
                  onChange={(e) => update({ feedback: e.target.value || undefined })}
                />
              ) : null
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-foreground"
              checked={def.multiple}
              onChange={(e) => {
                const multiple = e.target.checked;
                // Switching to single-answer keeps at most the first correct option.
                const firstCorrect = def.options.find((o) => o.correct)?.id;
                set({
                  multiple,
                  options: multiple
                    ? def.options
                    : def.options.map((o) => ({ ...o, correct: o.id === firstCorrect })),
                });
              }}
            />
            Allow multiple answers
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-foreground"
              checked={def.shuffle}
              onChange={(e) => set({ shuffle: e.target.checked })}
            />
            Shuffle options for each student
          </label>

          {def.multiple ? (
            <Field label="Scoring">
              <Select
                value={def.scoring}
                onChange={(e) => set({ scoring: e.target.value as McqDef["scoring"] })}
              >
                <option value="all-or-nothing">All or nothing</option>
                <option value="per-option">Partial credit per option</option>
                <option value="right-minus-wrong">Right minus wrong (can go negative)</option>
              </Select>
            </Field>
          ) : (
            <Field label="Wrong-answer penalty (%)" hint="Share of the points lost for a wrong answer. 0 = none.">
              <Input
                type="number"
                min={0}
                max={100}
                value={Math.round(def.penalty * 100)}
                onChange={(e) =>
                  set({ penalty: Math.min(1, Math.max(0, Number(e.target.value) / 100 || 0)) })
                }
              />
            </Field>
          )}
        </div>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    const selected = value?.selected ?? [];
    return (
      <div className="grid gap-4">
        <p className="whitespace-pre-wrap text-base">{instance.stem}</p>
        {instance.multiple ? <p className="text-xs text-muted-foreground">Select all that apply.</p> : null}
        <ChoiceList
          options={instance.options}
          selected={selected}
          multiple={instance.multiple}
          readOnly={readOnly}
          onToggle={(id) =>
            onChange?.({
              selected: instance.multiple
                ? selected.includes(id)
                  ? selected.filter((s) => s !== id)
                  : [...selected, id]
                : [id],
            })
          }
        />
      </div>
    );
  },
};
