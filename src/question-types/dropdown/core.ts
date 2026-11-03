import { z } from "zod";
import { gradeChoice } from "@/engine/grading/choice";
import { defineQuestionType } from "@/engine/question-type";
import type { PreflightIssue } from "@/engine/types";

// A single-answer choice rendered as a select. Inline dropdowns inside a
// sentence belong to the cloze type (Phase 4).
const defSchema = z.object({
  stem: z.string(),
  options: z.array(z.object({ id: z.string().min(1), text: z.string() })),
  answer: z.string(),
  shuffle: z.boolean().default(false),
});

const instanceSchema = z.object({
  stem: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })),
  answer: z.string(),
});

const responseSchema = z.object({ selected: z.string() });

export type DropdownDef = z.infer<typeof defSchema>;
export type DropdownInstance = z.infer<typeof instanceSchema>;
export type DropdownResponse = z.infer<typeof responseSchema>;

export const dropdown = defineQuestionType<DropdownDef, DropdownInstance, DropdownResponse>({
  id: "dropdown",
  label: "Dropdown",
  defSchema,
  instanceSchema,
  responseSchema,

  generate(def, rng) {
    return {
      instance: {
        stem: def.stem,
        options: def.shuffle ? rng.shuffle(def.options) : def.options,
        answer: def.answer,
      },
      vars: {},
    };
  },

  grade(inst, response, { points }) {
    return gradeChoice({
      options: inst.options,
      key: [inst.answer],
      selected: response ? [response.selected] : null,
      points,
      multiple: false,
    });
  },

  keyResponse(inst) {
    return { selected: inst.answer };
  },

  randomResponse(inst, rng) {
    return { selected: rng.pick(inst.options).id };
  },

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    if (!def.stem.trim()) {
      issues.push({ severity: "blocking", code: "dropdown.empty-stem", message: "The question has no text.", path: "stem" });
    }
    if (def.options.length < 2) {
      issues.push({ severity: "blocking", code: "dropdown.too-few-options", message: "Add at least two options.", path: "options" });
    }
    if (!def.options.some((o) => o.id === def.answer)) {
      issues.push({ severity: "blocking", code: "dropdown.no-answer", message: "Choose which option is correct.", path: "answer" });
    }
    def.options.forEach((o, i) => {
      if (!o.text.trim()) {
        issues.push({ severity: "blocking", code: "dropdown.empty-option", message: `Option ${i + 1} has no text.`, path: `options[${i}].text` });
      }
    });
    return issues;
  },

  redact({ answer: _answer, ...rest }) {
    return rest;
  },
});
