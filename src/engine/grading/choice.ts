import type { GradeLine, GradeResult } from "../types";
import { fmtPoints, roundScore, sumPoints } from "./format";

export type MultiScoring = "all-or-nothing" | "right-minus-wrong" | "per-option";

export interface ChoiceOption {
  id: string;
  text: string;
}

export interface ChoiceGradeInput {
  options: readonly ChoiceOption[];
  key: readonly string[];
  selected: readonly string[] | null;
  points: number;
  multiple: boolean;
  /** Multi-select scoring rule. */
  scoring?: MultiScoring;
  /** Single-select negative marking: fraction of points lost on a wrong answer. */
  penalty?: number;
}

export const SCORING_DESCRIPTIONS: Record<MultiScoring, string> = {
  "all-or-nothing": "Full points only if the selection matches the key exactly.",
  "right-minus-wrong":
    "Each correct option is worth an equal share; each wrong selection subtracts one share; the total never goes below 0.",
  "per-option":
    "Every option is worth an equal share, earned by selecting it if it's correct or leaving it if it's not.",
};

/**
 * Shared grader for single- and multi-select choice questions. Invariant:
 * the line points always sum to the score. Line points stay unrounded (2/3,
 * not 0.6667) so a perfect answer sums to exactly the maximum; only the
 * total is rounded.
 */
export function gradeChoice(input: ChoiceGradeInput): GradeResult {
  const { options, key, points } = input;
  const textOf = (id: string) => options.find((o) => o.id === id)?.text ?? id;
  const keySet = new Set(key);
  const valid = new Set(options.map((o) => o.id));
  const selected = [...new Set(input.selected ?? [])].filter((id) => valid.has(id));
  const list = (ids: readonly string[]) => (ids.length ? ids.map(textOf).join("; ") : "nothing");

  if (selected.length === 0) {
    return result(points, [
      {
        label: "Answer",
        expected: list(key),
        got: "no answer",
        verdict: "unanswered",
        points: 0,
        max: points,
      },
    ]);
  }

  if (!input.multiple) {
    const choice = selected[0];
    const correct = keySet.has(choice);
    const penalty = input.penalty ?? 0;
    return result(points, [
      {
        label: "Answer",
        expected: list(key),
        got: textOf(choice),
        verdict: correct ? "correct" : "wrong",
        points: correct ? points : roundScore(-penalty * points),
        max: points,
        note:
          !correct && penalty > 0
            ? `Wrong answers lose ${fmtPoints(penalty * points)}.`
            : undefined,
      },
    ]);
  }

  const scoring = input.scoring ?? "all-or-nothing";
  const selectedSet = new Set(selected);

  if (scoring === "all-or-nothing") {
    const exact = selected.length === keySet.size && selected.every((id) => keySet.has(id));
    return result(points, [
      {
        label: "Selection",
        expected: list(key),
        got: list(selected),
        verdict: exact ? "correct" : "wrong",
        points: exact ? points : 0,
        max: points,
        note: SCORING_DESCRIPTIONS[scoring],
      },
    ]);
  }

  const lines: GradeLine[] = [];
  if (scoring === "per-option") {
    const share = points / options.length;
    for (const o of options) {
      const shouldPick = keySet.has(o.id);
      const picked = selectedSet.has(o.id);
      const right = shouldPick === picked;
      lines.push({
        label: o.text,
        expected: shouldPick ? "selected" : "not selected",
        got: picked ? "selected" : "not selected",
        verdict: right ? "correct" : "wrong",
        points: right ? share : 0,
        max: share,
      });
    }
    return result(points, lines);
  }

  // right-minus-wrong
  const share = points / Math.max(1, keySet.size);
  for (const o of options) {
    const shouldPick = keySet.has(o.id);
    const picked = selectedSet.has(o.id);
    if (!shouldPick && !picked) continue;
    lines.push({
      label: o.text,
      expected: shouldPick ? "selected" : "not selected",
      got: picked ? "selected" : "not selected",
      verdict: shouldPick === picked ? "correct" : "wrong",
      points: shouldPick ? (picked ? share : 0) : -share,
      max: shouldPick ? share : 0,
    });
  }
  const raw = sumPoints(lines);
  if (raw < 0) {
    lines.push({
      label: "Minimum score",
      expected: "0 or more",
      got: fmtPoints(raw),
      verdict: "wrong",
      points: -raw,
      max: 0,
      note: "This question's score can't go below 0.",
    });
  }
  return result(points, lines);
}

function result(max: number, lines: GradeLine[]): GradeResult {
  return { score: sumPoints(lines), max, needsReview: false, lines };
}
