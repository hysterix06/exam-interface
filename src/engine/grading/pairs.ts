import type { GradeLine, GradeResult } from "../types";
import { fmtPoints, roundScore, sumPoints } from "./format";

export interface PairRow {
  /** What is being placed or matched (a left-hand item, an item to sort, a pin). */
  id: string;
  label: string;
  /** Where it belongs. */
  expectedId: string;
}

/**
 * Shared grader for "put each thing in its place" questions: matching pairs,
 * sorting items into categories, labelling a diagram. Each row is worth an
 * equal share; a wrong placement can cost `penalty` of a share; the total
 * never goes below 0. Lines sum to the score.
 */
export function gradePairs(input: {
  rows: readonly PairRow[];
  /** Row id -> chosen target id. */
  given: Readonly<Record<string, string | undefined>>;
  textOf: (targetId: string) => string;
  points: number;
  /** Fraction of a row's share lost when it is placed wrongly (0 = none). */
  penalty?: number;
}): GradeResult {
  const { rows, given, textOf, points } = input;
  const penalty = input.penalty ?? 0;
  const share = points / rows.length;
  const answered = rows.some((r) => given[r.id]);

  const lines = rows.map((r): GradeLine => {
    const got = given[r.id];
    const expected = textOf(r.expectedId);
    if (!answered || !got) return { label: r.label, expected, got: "no answer", verdict: "unanswered", points: 0, max: share };
    const ok = got === r.expectedId;
    return {
      label: r.label,
      expected,
      got: textOf(got),
      verdict: ok ? "correct" : "wrong",
      points: ok ? share : penalty ? -penalty * share : 0,
      max: share,
      ...(!ok && penalty ? { note: `Wrong placements lose ${fmtPoints(penalty * share)}.` } : {}),
    };
  });
  const raw = sumPoints(lines);
  if (raw < 0) {
    lines.push({ label: "Minimum score", expected: "0 or more", got: fmtPoints(raw), verdict: "wrong", points: -raw, max: 0, note: "This question's score can't go below 0." });
  }
  return { score: roundScore(lines.reduce((s, l) => s + l.points, 0)), max: points, needsReview: false, lines };
}
