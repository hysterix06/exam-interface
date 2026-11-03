import { fmtNum } from "../grading/format";
import type { Names } from "./check";
import type { Blueprint, SelectionTrace } from "./types";

/**
 * Plain-language account of how one student's questions were chosen, e.g.
 * "Q-17: drawn from Genetics (difficulty 2); ranked 1 of 6 in the weighted
 * draw; its weight is 25% of its group."
 */
export function explainSelection(
  trace: SelectionTrace,
  blueprint: Blueprint,
  names: { topics?: Names; questions?: Names } = {},
): string[] {
  const topic = (i: number) => {
    const id = blueprint.sections[i]?.topicId ?? "";
    return names.topics?.[id] ?? id;
  };
  const q = (id: string) => names.questions?.[id] ?? id;

  const lines = trace.picks.map((p) => {
    const level = p.difficulty === null ? "" : ` (difficulty ${p.difficulty})`;
    const share = `${fmtNum(Math.round(p.weightShare * 1000) / 10)}%`;
    return `${q(p.questionId)}: drawn from ${topic(p.sectionIndex)}${level}; ranked ${p.rank} of ${p.candidates} in the weighted draw; its weight is ${share} of the candidates.`;
  });
  for (const s of trace.skips) {
    const why =
      s.reason === "variant-group"
        ? `it is a variant of ${q(s.because)}, which was already drawn`
        : `it can't appear with ${q(s.because)}`;
    lines.push(`${q(s.questionId)}: skipped because ${why}.`);
  }
  lines.push(
    trace.shuffled
      ? "Question order was then shuffled for this student."
      : "Questions appear in section order.",
  );
  return lines;
}
