"use client";

import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OptionRows } from "../choice-ui";
import type { QuestionTypeUi } from "../ui-types";
import type { DropdownDef, DropdownInstance, DropdownResponse } from "./core";

type StudentInstance = Omit<DropdownInstance, "answer">;

export const dropdownUi: QuestionTypeUi<DropdownDef, StudentInstance, DropdownResponse> = {
  id: "dropdown",
  description: "Pick one answer from a dropdown. Compact for long option lists.",

  newDef: () => ({
    stem: "",
    options: ["a", "b", "c"].map((id) => ({ id, text: "" })),
    answer: "",
    shuffle: false,
  }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<DropdownDef>) => onChange({ ...def, ...patch });
    return (
      <div className="grid gap-5">
        <Field label="Question">
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Options</span>
          <p className="text-xs text-muted-foreground">Select the one correct option.</p>
          <OptionRows
            options={def.options}
            onChange={(options) => set({ options })}
            makeOption={(id) => ({ id, text: "" })}
            mark={(o, i) => (
              <input
                type="radio"
                name="dropdown-correct"
                aria-label={`Option ${i + 1} is correct`}
                className="accent-foreground"
                checked={def.answer === o.id}
                onChange={() => set({ answer: o.id })}
              />
            )}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-foreground"
            checked={def.shuffle}
            onChange={(e) => set({ shuffle: e.target.checked })}
          />
          Shuffle options for each student
        </label>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    return (
      <div className="grid gap-4">
        <p className="whitespace-pre-wrap text-base">{instance.stem}</p>
        <Select
          aria-label="Your answer"
          value={value?.selected ?? ""}
          disabled={readOnly}
          onChange={(e) => onChange?.({ selected: e.target.value })}
        >
          <option value="" disabled>
            Choose an answer…
          </option>
          {instance.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.text}
            </option>
          ))}
        </Select>
      </div>
    );
  },
};
