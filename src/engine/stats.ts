import { fmtNum } from "./grading/format";
import type { Explanation } from "./types";

export interface Explained {
  value: number;
  explanation: Explanation;
}

const pct = (n: number) => `${fmtNum(Math.round(n * 10) / 10)}%`;

/** Mean of percentages, with its working. null when there are none. */
export function averagePercent(pcts: readonly number[]): Explained | null {
  if (pcts.length === 0) return null;
  const total = pcts.reduce((s, p) => s + p, 0);
  const value = total / pcts.length;
  return {
    value,
    explanation: {
      formula: "Add up every graded student's percentage, then divide by the number of graded students.",
      inputs: [
        { label: "Graded students", value: fmtNum(pcts.length) },
        { label: "Sum of percentages", value: pct(total) },
        { label: "Average", value: `${pct(total)} ÷ ${fmtNum(pcts.length)} = ${pct(value)}` },
      ],
    },
  };
}

/** Middle percentage, with which positions it came from. null when there are none. */
export function medianPercent(pcts: readonly number[]): Explained | null {
  if (pcts.length === 0) return null;
  const s = [...pcts].sort((a, b) => a - b);
  const n = s.length;
  const m = Math.floor(n / 2);
  if (n % 2) {
    return {
      value: s[m],
      explanation: {
        formula: "Sort the graded percentages from lowest to highest and take the middle one.",
        inputs: [
          { label: "Graded students", value: `${fmtNum(n)} (odd, so there is one middle value)` },
          { label: `Student ${fmtNum(m + 1)} of ${fmtNum(n)}`, value: pct(s[m]) },
        ],
      },
    };
  }
  const value = (s[m - 1] + s[m]) / 2;
  return {
    value,
    explanation: {
      formula: "Sort the graded percentages from lowest to highest and average the two in the middle.",
      inputs: [
        { label: "Graded students", value: `${fmtNum(n)} (even, so two middle values)` },
        { label: `Student ${fmtNum(m)} of ${fmtNum(n)}`, value: pct(s[m - 1]) },
        { label: `Student ${fmtNum(m + 1)} of ${fmtNum(n)}`, value: pct(s[m]) },
        { label: "Median", value: `(${pct(s[m - 1])} + ${pct(s[m])}) ÷ 2 = ${pct(value)}` },
      ],
    },
  };
}
