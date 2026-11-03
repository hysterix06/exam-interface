import { z } from "zod";
import { gradeChoice } from "@/engine/grading/choice";
import { defineQuestionType } from "@/engine/question-type";
import type { PreflightIssue } from "@/engine/types";

const defSchema = z.object({
  stem: z.string(),
  answer: z.boolean(),
  penalty: z.number().min(0).max(1).default(0),
});

const instanceSchema = z.object({
  stem: z.string(),
  answer: z.boolean(),
  penalty: z.number(),
});

const responseSchema = z.object({ value: z.boolean() });

export type TrueFalseDef = z.infer<typeof defSchema>;
export type TrueFalseInstance = z.infer<typeof instanceSchema>;
export type TrueFalseResponse = z.infer<typeof responseSchema>;

const OPTIONS = [
  { id: "true", text: "True" },
  { id: "false", text: "False" },
];

export const trueFalse = defineQuestionType<TrueFalseDef, TrueFalseInstance, TrueFalseResponse>({
  id: "true-false",
  label: "True / false",
  defSchema,
  instanceSchema,
  responseSchema,

  generate(def) {
    return { instance: { stem: def.stem, answer: def.answer, penalty: def.penalty }, vars: {} };
  },

  grade(inst, response, { points }) {
    return gradeChoice({
      options: OPTIONS,
      key: [String(inst.answer)],
      selected: response ? [String(response.value)] : null,
      points,
      multiple: false,
      penalty: inst.penalty,
    });
  },

  keyResponse(inst) {
    return { value: inst.answer };
  },

  randomResponse(_inst, rng) {
    return { value: rng.next() < 0.5 };
  },

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    if (!def.stem.trim()) {
      issues.push({ severity: "blocking", code: "true-false.empty-stem", message: "The statement has no text.", path: "stem" });
    }
    return issues;
  },

  redact({ answer: _answer, ...rest }) {
    return rest;
  },
});
