import type { LatePenalty } from "../attempts/late";
import { fmtNum, roundScore } from "../grading/format";
import { markRubric, type RubricCriterion } from "../grading/rubric";
import type { GradeLine } from "../types";
import { dueLatePenalty, type DueLatePolicy } from "./late";

export interface SubmissionGrade {
  score: number;
  max: number;
  lines: GradeLine[];
  latePenalty: LatePenalty | null;
}

/**
 * Marks one hand-in. With a rubric, each ticked criterion earns its share of
 * the points (weights are relative, like long-answer questions). Without one,
 * the marker gives a single score. Any late penalty comes off what was earned,
 * as its own line, so the lines always add up to the score.
 */
export function gradeSubmission(input: {
  rubric: readonly RubricCriterion[];
  points: number;
  ticked?: readonly string[];
  score?: number;
  lateMinutes: number;
  late: DueLatePolicy;
}): SubmissionGrade {
  const { rubric, points } = input;
  let lines: GradeLine[];
  if (rubric.length > 0) {
    lines = markRubric(rubric, input.ticked ?? [], points).lines;
  } else {
    const s = roundScore(Math.min(points, Math.max(0, input.score ?? 0)));
    lines = [{
      label: "Marked by hand",
      expected: `out of ${fmtNum(points)}`,
      got: `${fmtNum(s)} points`,
      verdict: s >= points ? "correct" : s <= 0 ? "wrong" : "partial",
      points: s,
      max: points,
    }];
  }
  const earned = roundScore(lines.reduce((s, l) => s + l.points, 0));
  const latePenalty = dueLatePenalty(input.late, input.lateMinutes, earned);
  if (latePenalty && latePenalty.points > 0) {
    lines.push({ label: "Late penalty", expected: "on time", got: latePenalty.explanation, verdict: "partial", points: -latePenalty.points, max: 0 });
  }
  return { score: roundScore(lines.reduce((s, l) => s + l.points, 0)), max: points, lines, latePenalty };
}
