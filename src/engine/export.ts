import type { CsvCell } from "./csv";
import { fmtNum } from "./grading/format";

/** The rows of the two CSV exports. Pure, so the column contract is tested. */

export interface ExtensionLike {
  kind: "minutes" | "multiplier";
  value: number;
}

export interface SummaryInput {
  attemptId: string;
  name: string | null;
  email: string;
  state: string;
  score: number | null;
  maxScore: number | null;
  startedAt: Date;
  submittedAt: Date | null;
  seed: string;
  extensions: readonly ExtensionLike[];
  blurs: number;
  pastes: number;
  /** Set when the attempt was accepted late under the exam's late policy. */
  latePenalty?: { minutes: number; points: number } | null;
}

export interface ItemInput {
  attemptId: string;
  name: string | null;
  email: string;
  position: number;
  question: string;
  topic: string | null;
  version: number;
  score: number | null;
  max: number | null;
  gradedBy: string | null;
  needsReview: boolean | null;
  overrideReason: string | null;
}

// The first eight columns predate the rest; keep them first so old sheets still line up.
export const SUMMARY_HEADER = ["Student", "Email", "Status", "Score", "Out of", "Percent", "Started", "Submitted", "Extra time", "Tab switches", "Pastes", "Attempt ID", "Seed", "Minutes late", "Late penalty (points)"];

export const ITEM_HEADER = ["Student", "Email", "Attempt ID", "Question #", "Question", "Topic", "Version", "Score", "Out of", "Graded by", "Needs marking", "Score changed by hand"];

export function extraTimeText(exts: readonly ExtensionLike[]): string {
  return exts.map((e) => (e.kind === "minutes" ? `${e.value > 0 ? "+" : ""}${fmtNum(e.value)} min` : `×${fmtNum(e.value)} time`)).join("; ");
}

export function summaryRows(rows: readonly SummaryInput[]): CsvCell[][] {
  return rows.map((r) => [
    r.name ?? "",
    r.email,
    r.state,
    r.score,
    r.maxScore,
    r.score !== null && r.maxScore ? Math.round((r.score / r.maxScore) * 1000) / 10 : null,
    r.startedAt.toISOString(),
    r.submittedAt?.toISOString() ?? "",
    extraTimeText(r.extensions),
    r.blurs,
    r.pastes,
    r.attemptId,
    r.seed,
    r.latePenalty?.minutes ?? 0,
    r.latePenalty?.points ?? 0,
  ]);
}

export function itemRows(rows: readonly ItemInput[]): CsvCell[][] {
  return rows.map((r) => [
    r.name ?? "",
    r.email,
    r.attemptId,
    r.position + 1,
    r.question,
    r.topic ?? "",
    r.version,
    r.score,
    r.max,
    r.gradedBy ?? "",
    r.needsReview ? "yes" : "no",
    r.overrideReason ?? "",
  ]);
}
