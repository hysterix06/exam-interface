import { roundScore } from "./grading/format";
import type { Explanation } from "./types";
import { questionTypes } from "@/question-types/registry";

export interface AnalysisItem {
  questionId: string;
  score: number;
  max: number;
  /** Tokens the student chose (types with discrete choices only; see responseTokens). */
  chosen?: string[] | null;
}

export interface AnalysisAttempt {
  attemptId: string;
  items: AnalysisItem[];
}

export type FlagCode = "too-easy" | "too-hard" | "low-discrimination" | "negative-discrimination" | "dead-distractor" | "small-sample";

export interface Flag {
  code: FlagCode;
  /** Plain-language explanation for the educator. */
  message: string;
}

export interface DistractorRow {
  optionId: string;
  /** Students who chose it among all who answered. */
  count: number;
  share: number;
  /** Share among the strongest 27% / weakest 27% of students overall. */
  upperShare: number;
  lowerShare: number;
}

export interface ItemStats {
  questionId: string;
  n: number;
  /** Mean fraction of the available points earned (0–1): "percent correct". */
  difficulty: number;
  /** Point-biserial style correlation of this item with the rest of the exam (−1 to 1), or null if undefined. */
  discrimination: number | null;
  distractors: DistractorRow[];
  flags: Flag[];
}

/** Below this many students the numbers are wobbly; we say so instead of hiding it. */
export const MIN_SAMPLE = 30;

export function mean(xs: readonly number[]) {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Pearson correlation; null when either side has no variation. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

const fraction = (i: AnalysisItem) => (i.max > 0 ? i.score / i.max : 0);

/**
 * Classical item analysis. Discrimination uses the "corrected" total: each
 * student's score on the OTHER questions, so an item can't correlate with
 * itself. Pure and deterministic; every number can be recomputed by hand.
 */
export function analyseItems(attempts: readonly AnalysisAttempt[]): ItemStats[] {
  const questionIds = [...new Set(attempts.flatMap((a) => a.items.map((i) => i.questionId)))];

  // Everyone's total fraction, for the upper/lower groups used in distractor analysis.
  const totals = attempts.map((a) => ({ id: a.attemptId, total: mean(a.items.map(fraction)) })).sort((a, b) => b.total - a.total);
  const groupSize = Math.max(1, Math.round(attempts.length * 0.27));
  const upper = new Set(totals.slice(0, groupSize).map((t) => t.id));
  const lower = new Set(totals.slice(-groupSize).map((t) => t.id));

  return questionIds.map((questionId): ItemStats => {
    const rows = attempts.flatMap((a) => {
      const item = a.items.find((i) => i.questionId === questionId);
      if (!item) return [];
      const rest = a.items.filter((i) => i.questionId !== questionId);
      return [{ attemptId: a.attemptId, item, restFraction: rest.length ? mean(rest.map(fraction)) : null }];
    });

    const n = rows.length;
    const difficulty = roundScore(mean(rows.map((r) => fraction(r.item))));
    const usable = rows.filter((r) => r.restFraction !== null);
    const r = pearson(usable.map((u) => fraction(u.item)), usable.map((u) => u.restFraction as number));
    const discrimination = r === null ? null : roundScore(r);

    // Distractor analysis, for questions where students pick from options.
    const answered = rows.filter((x) => x.item.chosen && x.item.chosen.length > 0);
    const options = [...new Set(answered.flatMap((x) => x.item.chosen as string[]))];
    const share = (subset: typeof answered, id: string) =>
      subset.length === 0 ? 0 : subset.filter((x) => (x.item.chosen as string[]).includes(id)).length / subset.length;
    const distractors = options
      .map((optionId): DistractorRow => ({
        optionId,
        count: answered.filter((x) => (x.item.chosen as string[]).includes(optionId)).length,
        share: roundScore(share(answered, optionId)),
        upperShare: roundScore(share(answered.filter((x) => upper.has(x.attemptId)), optionId)),
        lowerShare: roundScore(share(answered.filter((x) => lower.has(x.attemptId)), optionId)),
      }))
      .sort((a, b) => b.count - a.count);

    const flags: Flag[] = [];
    if (n < MIN_SAMPLE) {
      flags.push({ code: "small-sample", message: `Only ${n} ${n === 1 ? "student has" : "students have"} answered. Treat these numbers as a hint, not a verdict (${MIN_SAMPLE}+ is better).` });
    }
    if (difficulty > 0.9) flags.push({ code: "too-easy", message: `${Math.round(difficulty * 100)}% of the available points were earned. Almost everyone gets it right, so it tells you little.` });
    if (difficulty < 0.2) flags.push({ code: "too-hard", message: `Only ${Math.round(difficulty * 100)}% of the available points were earned. Check the key and the wording before blaming the students.` });
    if (discrimination !== null && discrimination < 0) {
      flags.push({ code: "negative-discrimination", message: "Stronger students did worse on this than weaker ones. The answer key may be wrong." });
    } else if (discrimination !== null && discrimination < 0.2) {
      flags.push({ code: "low-discrimination", message: "It barely separates strong students from weak ones (below 0.2)." });
    }

    return { questionId, n, difficulty, discrimination, distractors, flags };
  });
}

/** Add "this option was never chosen" flags once the option list is known. */
export function withDeadDistractors(stat: ItemStats, optionIds: readonly string[], keyIds: readonly string[]): ItemStats {
  const chosen = new Set(stat.distractors.map((d) => d.optionId));
  const dead = optionIds.filter((id) => !keyIds.includes(id) && !chosen.has(id));
  if (dead.length === 0 || stat.n < 2) return stat;
  return {
    ...stat,
    flags: [...stat.flags, { code: "dead-distractor", message: `${dead.length} wrong ${dead.length === 1 ? "option was" : "options were"} never chosen, so ${dead.length === 1 ? "it isn't" : "they aren't"} doing any work.` }],
  };
}

/**
 * What a saved response chose, as the type's analysis tokens; null when the
 * type has no discrete choices or the response doesn't parse.
 */
export function responseTokens(typeId: string, instance: unknown, response: unknown): string[] | null {
  if (response === null || response === undefined) return null;
  const type = questionTypes.get(typeId);
  if (!type?.analysisTokens) return null;
  const parsed = type.responseSchema.safeParse(response);
  return parsed.success ? type.analysisTokens(instance, parsed.data) : null;
}

/** Every token a question offers, with text and the key; null for types without choices. */
export function tokenUniverse(typeId: string, instance: unknown) {
  return questionTypes.get(typeId)?.tokenUniverse?.(instance) ?? null;
}

/** The working behind an item's "percent correct" and "discrimination", for the educator. */
export function explainItem(s: Pick<ItemStats, "n" | "difficulty" | "discrimination">): { difficulty: Explanation; discrimination: Explanation } {
  const small = s.n < MIN_SAMPLE ? `Only ${s.n} students answered; below ${MIN_SAMPLE} these numbers move a lot between groups.` : undefined;
  return {
    difficulty: {
      formula: "For each student, the points they earned on this question ÷ the points it was worth; then the average of those shares.",
      inputs: [
        { label: "Students who answered", value: String(s.n) },
        { label: "Average share earned", value: `${Math.round(s.difficulty * 1000) / 10}%` },
        { label: "Flagged when", value: "above 90% (too easy) or below 20% (too hard)" },
      ],
      note: small,
    },
    discrimination: {
      formula:
        "How closely scoring well on this question goes with scoring well on the rest of the exam (Pearson correlation of this question's score with each student's total minus this question). 1 means the strongest students always got it, 0 means no link, below 0 means weaker students did better.",
      inputs: [
        { label: "Students", value: String(s.n) },
        { label: "Correlation", value: s.discrimination === null ? "n/a (everyone scored the same)" : String(Math.round(s.discrimination * 100) / 100) },
        { label: "Good", value: "above 0.3" },
        { label: "Flagged when", value: "below 0.2, or negative" },
      ],
      note: small,
    },
  };
}
