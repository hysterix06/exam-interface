import { z } from "zod";
import { latePolicySchema } from "./attempts/late";

/** Exam-level rules, stored in exams.settings. `{}` parses to the defaults. */
export const examSettingsSchema = z.object({
  /** Minutes allowed once an attempt starts; null = untimed. */
  timeLimitMinutes: z.number().int().min(1).nullable().default(null),
  attemptsAllowed: z.number().int().min(1).default(1),
  /** Students must redeem a single-use code to enter. */
  requireCode: z.boolean().default(false),
  /** Students cannot go back to earlier questions. */
  oneWayNavigation: z.boolean().default(false),
  /** What students see after results are released. */
  release: z.enum(["score", "answers", "feedback", "explanations"]).default("score"),
  /** Seconds per question; when set, each question locks once its time is up (implies one-way). */
  questionTimeLimitSeconds: z.number().int().min(10).max(3600).nullable().default(null),
  /** What happens after the time limit: end the attempt (default) or accept late work with a penalty. */
  late: latePolicySchema,
  /**
   * Adaptive: the next question is chosen after each answer (one at a time,
   * one way). The blueprint's topics form the pool; `length` questions are asked.
   */
  adaptive: z
    .object({
      rule: z.enum(["staircase", "rasch"]).default("staircase"),
      length: z.number().int().min(1).max(200),
      /** Share of a question's points that counts as answering it right. */
      threshold: z.number().gt(0).max(1).default(0.5),
    })
    .nullable()
    .default(null),
});

export type ExamSettings = z.infer<typeof examSettingsSchema>;

export const RELEASE_LABELS: Record<ExamSettings["release"], string> = {
  score: "Score only",
  answers: "Score and correct answers",
  feedback: "Score, answers and feedback",
  explanations: "Score, answers and full grading explanations",
};

/**
 * Sequential attempts go one question at a time, and the server enforces it:
 * it hands out and accepts only the current question. One-way navigation and
 * per-question time limits both need that.
 */
export function isSequential(s: Pick<ExamSettings, "oneWayNavigation" | "questionTimeLimitSeconds"> & { adaptive?: ExamSettings["adaptive"] }) {
  return s.oneWayNavigation || s.questionTimeLimitSeconds !== null || (s.adaptive ?? null) !== null;
}
