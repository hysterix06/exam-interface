import type { GradeResult } from "../types";
import { roundScore } from "./format";

/**
 * What a perfect answer must score by machine: every point except those on
 * lines a person has to mark ("review"). For a fully hand-marked question that
 * is 0; for a passage with one written part it is the other parts' points.
 */
export function expectedKeyScore(result: Pick<GradeResult, "lines">, points: number): number {
  const reviewMax = result.lines.filter((l) => l.verdict === "review").reduce((s, l) => s + l.max, 0);
  return roundScore(points - reviewMax);
}

/** Whether a perfect answer still waits for a person (some line is "review"). */
export function keyNeedsReview(result: Pick<GradeResult, "lines">): boolean {
  return result.lines.some((l) => l.verdict === "review");
}
