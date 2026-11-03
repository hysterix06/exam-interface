// Shared result shapes. These are data, not presentation: the UI renders them
// verbatim so every score and decision can be explained to an educator.

export type Verdict = "correct" | "partial" | "wrong" | "unanswered" | "review";

/** One line of a plain-language grading explanation. */
export interface GradeLine {
  /** What was checked, e.g. "Answer" or "Option B". */
  label: string;
  expected: string;
  got: string;
  verdict: Verdict;
  /** Points awarded by this line (may be negative under penalty rules). */
  points: number;
  /** Points available on this line. */
  max: number;
  /** Extra detail, e.g. "within ±0.1". */
  note?: string;
}

export interface GradeResult {
  score: number;
  max: number;
  needsReview: boolean;
  lines: GradeLine[];
}

export interface GradeOpts {
  /** Points the question is worth in this exam. */
  points: number;
}

export interface GenerateResult<TInstance> {
  instance: TInstance;
  /** Variable values used to build the instance (empty for static questions). */
  vars: Record<string, string | number | boolean>;
}

export type IssueSeverity = "blocking" | "warning";

export interface PreflightIssue {
  severity: IssueSeverity;
  /** Stable machine code, e.g. "mcq.no-correct-option". */
  code: string;
  /** Plain-language message for the educator. */
  message: string;
  /** Where in the definition, e.g. "options[2].text". */
  path?: string;
}
