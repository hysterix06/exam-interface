"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChoiceList } from "../choice-ui";
import type { QuestionTypeUi } from "../ui-types";
import type { TrueFalseDef, TrueFalseInstance, TrueFalseResponse } from "./core";

type StudentInstance = Omit<TrueFalseInstance, "answer" | "penalty">;

const OPTIONS = [
  { id: "true", text: "True" },
  { id: "false", text: "False" },
];

export const trueFalseUi: QuestionTypeUi<TrueFalseDef, StudentInstance, TrueFalseResponse> = {
  id: "true-false",
  description: "A statement the student marks true or false.",

  newDef: () => ({ stem: "", answer: true, penalty: 0 }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<TrueFalseDef>) => onChange({ ...def, ...patch });
    return (
      <div className="grid gap-5">
        <Field label="Statement" hint="Write it so it is clearly true or clearly false.">
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>
        <div className="grid gap-2">
          <span className="text-sm font-medium">The statement is</span>
          <ChoiceList
            options={OPTIONS}
            selected={[String(def.answer)]}
            multiple={false}
            onToggle={(id) => set({ answer: id === "true" })}
          />
        </div>
        <Field label="Wrong-answer penalty (%)" hint="Share of the points lost for a wrong answer. 0 = none.">
          <Input
            className="max-w-32"
            type="number"
            min={0}
            max={100}
            value={Math.round(def.penalty * 100)}
            onChange={(e) =>
              set({ penalty: Math.min(1, Math.max(0, Number(e.target.value) / 100 || 0)) })
            }
          />
        </Field>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    return (
      <div className="grid gap-4">
        <p className="whitespace-pre-wrap text-base">{instance.stem}</p>
        <ChoiceList
          options={OPTIONS}
          selected={value ? [String(value.value)] : []}
          multiple={false}
          readOnly={readOnly}
          onToggle={(id) => onChange?.({ value: id === "true" })}
        />
      </div>
    );
  },
};
