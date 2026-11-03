import type { GradeLine } from "../types";
import type { Visibility } from "./release";

export interface RawItemResult {
  score: number;
  max: number;
  lines: GradeLine[];
  /** Author-written per-option feedback from the instance, if the type has any. */
  feedback?: Record<string, string>;
}

export interface ShownItemResult {
  score?: number;
  max?: number;
  lines?: GradeLine[];
  feedback?: Record<string, string>;
}

/**
 * Trim one graded item to what a student may see. Levels are cumulative:
 * score < answers (per-item lines with the expected answer) < feedback
 * (+ author feedback) < explanations (+ the grader's reasoning notes).
 */
export function shapeItemResult(v: Visibility, item: RawItemResult): ShownItemResult {
  const out: ShownItemResult = {};
  if (!v.answers) return out;
  out.score = item.score;
  out.max = item.max;
  out.lines = item.lines.map((l) => (v.explanations ? l : { ...l, note: undefined }));
  if (v.feedback && item.feedback && Object.keys(item.feedback).length > 0) out.feedback = item.feedback;
  return out;
}

/** Pull the optional feedback map off a frozen instance without knowing its type. */
export function instanceFeedback(instance: unknown): Record<string, string> | undefined {
  if (!instance || typeof instance !== "object" || !("feedback" in instance)) return undefined;
  const f = (instance as { feedback: unknown }).feedback;
  if (!f || typeof f !== "object") return undefined;
  const entries = Object.entries(f).filter(([, v]) => typeof v === "string");
  return entries.length ? (Object.fromEntries(entries) as Record<string, string>) : undefined;
}
