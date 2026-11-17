import { z } from "zod";
import { markRubric, pendingRubric, rubricCriteria } from "@/engine/grading/rubric";
import { defineQuestionType } from "@/engine/question-type";
import type { GradeResult, PreflightIssue } from "@/engine/types";

const criterionSchema = z.object({ id: z.string().min(1), text: z.string(), points: z.number() });

const defSchema = z.object({
  stem: z.string(),
  /** Checklist a grader ticks. Weights are scaled to the question's points. */
  rubric: z.array(criterionSchema),
  maxWords: z.number().int().min(1).nullable().default(null),
  /** Highlighted in the answer to speed up marking; never sets the score. */
  keywords: z.array(z.string()).default([]),
});

const instanceSchema = z.object({
  stem: z.string(),
  rubric: z.array(criterionSchema),
  maxWords: z.number().nullable(),
  keywords: z.array(z.string()),
});
const responseSchema = z.object({ text: z.string() });

export type LongAnswerDef = z.infer<typeof defSchema>;
export type LongAnswerInstance = z.infer<typeof instanceSchema>;
export type LongAnswerResponse = z.infer<typeof responseSchema>;

export const wordCount = (text: string) => (text.trim() === "" ? 0 : text.trim().split(/\s+/).length);

/** Grader aids: which keywords appear. Informational only. */
export function keywordHits(text: string, keywords: readonly string[]) {
  const lower = text.toLocaleLowerCase("en");
  const found = keywords.filter((k) => k.trim() && lower.includes(k.trim().toLocaleLowerCase("en")));
  return { found, missing: keywords.filter((k) => k.trim() && !found.includes(k)) };
}

/**
 * The human's marking, as data: the ticked criteria become grade lines whose
 * points are each criterion's share of the question's points.
 */
export function gradeRubric(inst: LongAnswerInstance, ticked: readonly string[], points: number): GradeResult {
  return markRubric(inst.rubric, ticked, points);
}

export const longAnswer = defineQuestionType<LongAnswerDef, LongAnswerInstance, LongAnswerResponse>({
  id: "long-answer",
  label: "Long answer",
  manual: true,
  defSchema,
  instanceSchema,
  responseSchema,

  generate: (def) => ({
    instance: { stem: def.stem, rubric: def.rubric, maxWords: def.maxWords, keywords: def.keywords },
    vars: {},
  }),

  grade(inst, response, { points }) {
    return pendingRubric(inst.rubric, (response?.text ?? "").trim() !== "", points);
  },

  review: {
    criteria: (inst, points) => rubricCriteria(inst.rubric, points),
    mark: (inst, _response, ticked, { points }) => gradeRubric(inst, ticked.filter((id) => inst.rubric.some((c) => c.id === id)), points),
    aids(inst, response) {
      const text = response?.text ?? "";
      const n = wordCount(text);
      const notes = [`${n} ${n === 1 ? "word" : "words"}${inst.maxWords ? ` (limit ${inst.maxWords})` : ""}`];
      if (inst.keywords.length) {
        const hits = keywordHits(text, inst.keywords);
        notes.push(`Keywords found: ${hits.found.length ? hits.found.join(", ") : "none"}${hits.missing.length ? `; not found: ${hits.missing.join(", ")}` : ""}`);
      }
      return { text, keywords: inst.keywords, notes };
    },
  },

  keyResponse: (inst) => ({ text: `A complete answer covering: ${inst.rubric.map((c) => c.text).join("; ")}.` }),

  randomResponse: (_inst, rng) => ({ text: Array.from({ length: rng.int(5, 40) }, () => "word").join(" ") }),

  // About 20 words a minute when writing to a limit; ten minutes otherwise.
  estimateSeconds: (def) => (def.maxWords ? Math.max(120, def.maxWords * 3) : 600),

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    if (!def.stem.trim()) issues.push({ severity: "blocking", code: "long-answer.empty-stem", message: "The question has no text.", path: "stem" });
    if (def.rubric.length === 0) {
      issues.push({ severity: "blocking", code: "long-answer.no-rubric", message: "Add at least one rubric criterion so graders know what earns points.", path: "rubric" });
    }
    def.rubric.forEach((c, i) => {
      if (!c.text.trim()) issues.push({ severity: "blocking", code: "long-answer.empty-criterion", message: `Criterion ${i + 1} has no text.`, path: `rubric[${i}].text` });
      if (!(c.points > 0)) issues.push({ severity: "blocking", code: "long-answer.bad-weight", message: `Criterion ${i + 1} must be worth more than 0.`, path: `rubric[${i}].points` });
    });
    const ids = def.rubric.map((c) => c.id);
    if (new Set(ids).size !== ids.length) issues.push({ severity: "blocking", code: "long-answer.duplicate-id", message: "Two criteria share the same id.", path: "rubric" });
    issues.push({
      severity: "warning",
      code: "long-answer.manual",
      message: "This question is marked by hand. Results stay provisional until someone reviews it.",
    });
    return issues;
  },

  redact: ({ stem, maxWords }) => ({ stem, maxWords }),
});
