import { z } from "zod";

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
});

export type ExamSettings = z.infer<typeof examSettingsSchema>;

export const RELEASE_LABELS: Record<ExamSettings["release"], string> = {
  score: "Score only",
  answers: "Score and correct answers",
  feedback: "Score, answers and feedback",
  explanations: "Score, answers and full grading explanations",
};
