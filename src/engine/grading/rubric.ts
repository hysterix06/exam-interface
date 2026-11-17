import type { ReviewCriterion } from "../question-type";
import type { GradeLine, GradeResult } from "../types";
import { fmtNum, roundScore } from "./format";

/** A checklist item a marker ticks; `points` are relative weights, scaled to the question. */
export interface RubricCriterion {
  id: string;
  text: string;
  points: number;
}

const total = (rubric: readonly RubricCriterion[]) => rubric.reduce((s, c) => s + c.points, 0) || 1;

/** Before marking: one "awaiting a grader" line per criterion, worth 0 for now. */
export function pendingRubric(rubric: readonly RubricCriterion[], answered: boolean, points: number): GradeResult {
  const t = total(rubric);
  const lines = rubric.map((c): GradeLine => ({
    label: c.text,
    expected: `${fmtNum(c.points)} of ${fmtNum(t)} rubric points`,
    got: answered ? "awaiting a grader" : "no answer",
    verdict: answered ? "review" : "unanswered",
    points: 0,
    max: (points * c.points) / t,
  }));
  return { score: 0, max: points, needsReview: answered, lines };
}

/** The marker's ticks as grade lines: each ticked criterion earns its share of the points. */
export function markRubric(rubric: readonly RubricCriterion[], ticked: readonly string[], points: number): GradeResult {
  const t = total(rubric);
  const set = new Set(ticked);
  const lines = rubric.map((c): GradeLine => {
    const max = (points * c.points) / t;
    const ok = set.has(c.id);
    return { label: c.text, expected: `${fmtNum(c.points)} of ${fmtNum(t)} rubric points`, got: ok ? "met" : "not met", verdict: ok ? "correct" : "wrong", points: ok ? max : 0, max };
  });
  return { score: roundScore(lines.reduce((s, l) => s + l.points, 0)), max: points, needsReview: false, lines };
}

export function rubricCriteria(rubric: readonly RubricCriterion[], points: number): ReviewCriterion[] {
  const t = total(rubric);
  return rubric.map((c) => ({ id: c.id, text: c.text, points: (points * c.points) / t }));
}
