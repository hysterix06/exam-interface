"use client";
import { withFormatHint } from "../hints";
import { Prose } from "@/components/ui/prose";
import { useId } from "react";

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
        <Field label="Question" hint={withFormatHint("What the student reads above the dropdown, e.g. “Where does translation take place?”")}>
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Options</span>
          <p className="text-xs text-muted-foreground">
            Mark the one correct option. A dropdown suits long lists (countries, years); for three or four short
            choices, multiple choice is easier to read.
          </p>
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
        <p className="-mt-3 text-xs text-muted-foreground">Leave off when the order means something, such as years or a scale.</p>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    const stemId = useId();
    return (
      <div className="grid gap-4">
        <Prose id={stemId} className="text-base">{instance.stem}</Prose>
        <Select
          aria-label="Your answer"
          aria-describedby={stemId}
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
