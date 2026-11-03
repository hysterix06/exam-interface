import { z } from "zod";
import { gradeChoice, type MultiScoring } from "@/engine/grading/choice";
import { defineQuestionType } from "@/engine/question-type";
import type { PreflightIssue } from "@/engine/types";

const optionSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  correct: z.boolean(),
  /** Shown to the student after release when they chose this option. */
  feedback: z.string().optional(),
});

const scoringSchema = z.enum(["all-or-nothing", "right-minus-wrong", "per-option"]);

const defSchema = z.object({
  stem: z.string(),
  options: z.array(optionSchema),
  multiple: z.boolean().default(false),
  shuffle: z.boolean().default(true),
  /** Multi-select only. */
  scoring: scoringSchema.default("all-or-nothing"),
  /** Single-select only: fraction of points lost for a wrong answer. */
  penalty: z.number().min(0).max(1).default(0),
});

const instanceSchema = z.object({
  stem: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })),
  multiple: z.boolean(),
  scoring: scoringSchema,
  penalty: z.number(),
  key: z.array(z.string()),
  feedback: z.record(z.string(), z.string()),
});

const responseSchema = z.object({ selected: z.array(z.string()) });

export type McqDef = z.infer<typeof defSchema>;
export type McqInstance = z.infer<typeof instanceSchema>;
export type McqResponse = z.infer<typeof responseSchema>;

export const mcq = defineQuestionType<McqDef, McqInstance, McqResponse>({
  id: "mcq",
  label: "Multiple choice",
  defSchema,
  instanceSchema,
  responseSchema,

  generate(def, rng) {
    const ordered = def.shuffle ? rng.shuffle(def.options) : def.options;
    const feedback: Record<string, string> = {};
    for (const o of def.options) if (o.feedback) feedback[o.id] = o.feedback;
    return {
      instance: {
        stem: def.stem,
        options: ordered.map(({ id, text }) => ({ id, text })),
        multiple: def.multiple,
        scoring: def.scoring as MultiScoring,
        penalty: def.multiple ? 0 : def.penalty,
        key: def.options.filter((o) => o.correct).map((o) => o.id),
        feedback,
      },
      vars: {},
    };
  },

  grade(inst, response, { points }) {
    return gradeChoice({
      options: inst.options,
      key: inst.key,
      selected: response?.selected ?? null,
      points,
      multiple: inst.multiple,
      scoring: inst.scoring,
      penalty: inst.penalty,
    });
  },

  keyResponse(inst) {
    return { selected: [...inst.key] };
  },

  randomResponse(inst, rng) {
    const ids = inst.options.map((o) => o.id);
    if (!inst.multiple) return { selected: [rng.pick(ids)] };
    const picked = ids.filter(() => rng.next() < 0.5);
    return { selected: picked.length ? picked : [rng.pick(ids)] };
  },

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    const correct = def.options.filter((o) => o.correct).length;
    if (!def.stem.trim()) {
      issues.push({ severity: "blocking", code: "mcq.empty-stem", message: "The question has no text.", path: "stem" });
    }
    if (def.options.length < 2) {
      issues.push({ severity: "blocking", code: "mcq.too-few-options", message: "Add at least two options.", path: "options" });
    }
    if (correct === 0) {
      issues.push({ severity: "blocking", code: "mcq.no-correct-option", message: "Mark at least one option as correct.", path: "options" });
    }
    if (!def.multiple && correct > 1) {
      issues.push({
        severity: "blocking",
        code: "mcq.single-multiple-correct",
        message: `${correct} options are marked correct, but students can pick only one. Turn on "multiple answers" or unmark the extras.`,
        path: "options",
      });
    }
    def.options.forEach((o, i) => {
      if (!o.text.trim()) {
        issues.push({ severity: "blocking", code: "mcq.empty-option", message: `Option ${i + 1} has no text.`, path: `options[${i}].text` });
      }
    });
    const ids = def.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      issues.push({ severity: "blocking", code: "mcq.duplicate-option-id", message: "Two options share the same id.", path: "options" });
    }
    const texts = def.options.map((o) => o.text.trim().toLowerCase()).filter(Boolean);
    if (new Set(texts).size !== texts.length) {
      issues.push({ severity: "warning", code: "mcq.duplicate-option-text", message: "Two options have the same text.", path: "options" });
    }
    if (def.multiple && def.penalty > 0) {
      issues.push({
        severity: "warning",
        code: "mcq.penalty-ignored",
        message: 'Negative marking applies only to single-answer questions; use "right minus wrong" scoring for multiple answers.',
        path: "penalty",
      });
    }
    return issues;
  },

  redact({ key: _key, feedback: _feedback, ...rest }) {
    return rest;
  },
});
