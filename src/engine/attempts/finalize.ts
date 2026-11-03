import { roundScore } from "../grading/format";
import type { GradeLine } from "../types";
import { getQuestionType } from "@/question-types/registry";

export interface FinalizeInput {
  id: string;
  type: string;
  instance: unknown;
  response: unknown | null;
  points: number;
}

export interface FinalizedItem {
  id: string;
  score: number;
  max: number;
  needsReview: boolean;
  lines: GradeLine[];
}

export interface Finalized {
  items: FinalizedItem[];
  score: number;
  max: number;
  /** Some item awaits a human grader, so the total isn't final. */
  needsReview: boolean;
}

/**
 * Grade a whole attempt from its frozen instances. Pure: regrade and
 * "reproduce" call this again over the same stored data. A response that
 * doesn't fit the type's schema is treated as unanswered.
 */
export function finalizeAttempt(inputs: readonly FinalizeInput[]): Finalized {
  const items = inputs.map((i): FinalizedItem => {
    const type = getQuestionType(i.type);
    const parsed = i.response === null ? null : type.responseSchema.safeParse(i.response);
    const response = parsed && parsed.success ? parsed.data : null;
    const r = type.grade(i.instance, response, { points: i.points });
    return { id: i.id, score: r.score, max: r.max, needsReview: r.needsReview, lines: r.lines };
  });
  return {
    items,
    score: roundScore(items.reduce((s, i) => s + i.score, 0)),
    max: roundScore(items.reduce((s, i) => s + i.max, 0)),
    needsReview: items.some((i) => i.needsReview),
  };
}
