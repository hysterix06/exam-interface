import { fmtNum } from "./grading/format";
import type { GradeLine } from "./types";

export const OVERRIDE_LABEL = "Score changed by hand";

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * A person sets a question's score directly. The grader's own lines stay as
 * they were (so the educator can still see what the machine or rubric said),
 * and one adjustment line makes up the difference, so the lines still add up
 * to the score. A second override replaces the first rather than stacking.
 */
export function overrideLines(
  lines: readonly GradeLine[],
  o: { score: number; max: number; by: string; reason: string },
): GradeLine[] {
  const base = lines.filter((l) => l.label !== OVERRIDE_LABEL);
  const before = round(base.reduce((s, l) => s + l.points, 0));
  return [
    ...base,
    {
      label: OVERRIDE_LABEL,
      expected: `${fmtNum(before)} / ${fmtNum(o.max)} from the lines above`,
      got: `Changed by ${o.by}: ${o.reason}`,
      verdict: o.score >= o.max ? "correct" : o.score <= 0 ? "wrong" : "partial",
      points: round(o.score - before),
      max: 0,
    },
  ];
}
