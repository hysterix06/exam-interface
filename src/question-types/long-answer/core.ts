import { z } from "zod";
import { fmtNum, roundScore } from "@/engine/grading/format";
import { defineQuestionType } from "@/engine/question-type";
import type { GradeLine, GradeResult, PreflightIssue } from "@/engine/types";

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

const totalWeight = (inst: LongAnswerInstance) => inst.rubric.reduce((s, c) => s + c.points, 0);

/**
 * The human's marking, as data: the ticked criteria become grade lines whose
 * points are each criterion's share of the question's points.
 */
export function gradeRubric(inst: LongAnswerInstance, ticked: readonly string[], points: number): GradeResult {
  const total = totalWeight(inst) || 1;
  const set = new Set(ticked);
  const lines = inst.rubric.map((c): GradeLine => {
    const max = (points * c.points) / total;
    const ok = set.has(c.id);
    return {
      label: c.text,
      expected: `${fmtNum(c.points)} of ${fmtNum(total)} rubric points`,
      got: ok ? "met" : "not met",
      verdict: ok ? "correct" : "wrong",
      points: ok ? max : 0,
      max,
    };
  });
  return { score: roundScore(lines.reduce((s, l) => s + l.points, 0)), max: points, needsReview: false, lines };
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
    const total = totalWeight(inst) || 1;
    const answered = (response?.text ?? "").trim() !== "";
    const lines = inst.rubric.map((c): GradeLine => ({
      label: c.text,
      expected: `${fmtNum(c.points)} of ${fmtNum(total)} rubric points`,
      got: answered ? "awaiting a grader" : "no answer",
      verdict: answered ? "review" : "unanswered",
      points: 0,
      max: (points * c.points) / total,
    }));
    return { score: 0, max: points, needsReview: answered, lines };
  },

  keyResponse: (inst) => ({ text: `A complete answer covering: ${inst.rubric.map((c) => c.text).join("; ")}.` }),

  randomResponse: (_inst, rng) => ({ text: Array.from({ length: rng.int(5, 40) }, () => "word").join(" ") }),

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
