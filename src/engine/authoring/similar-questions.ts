import type { AttemptPoolItem } from "../attempt";
import { fmtNum } from "../grading/format";
import type { Names } from "../selection/check";
import { type Blueprint, blueprintTopics } from "../selection/types";
import type { PreflightIssue } from "../types";

/** Pairs at or above this share of shared 3-letter fragments count as near-identical. */
export const SIMILARITY_THRESHOLD = 0.8;

/** Keys that hold machinery (ids, modes), not words a student reads. */
const NOT_CONTENT = new Set(["id", "kind", "scoring", "widget", "pattern", "answer", "labelId"]);

/** Every content string in a definition (stem, options, answers...), lower-cased and joined. */
export function textOf(def: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) if (!NOT_CONTENT.has(k)) walk(x);
    }
  };
  walk(def);
  return out.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
}

function trigrams(s: string): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) grams.add(s.slice(i, i + 3));
  return grams;
}

/** Jaccard similarity of two strings' 3-letter fragments: 1 = same text, 0 = nothing shared. */
export function similarity(a: string, b: string): number {
  const x = trigrams(a);
  const y = trigrams(b);
  if (x.size === 0 && y.size === 0) return a === b ? 1 : 0;
  let shared = 0;
  for (const g of x) if (y.has(g)) shared++;
  return shared / (x.size + y.size - shared);
}

export interface SimilarPair {
  a: string;
  b: string;
  topicId: string;
  /** 0–1. */
  score: number;
}

/**
 * Questions in the same drawn topic that read almost the same, so a student
 * could get both. Pairs the author already handled (same variant group, or
 * marked as conflicting) are skipped.
 */
export function findSimilarQuestions(blueprint: Blueprint, pool: readonly AttemptPoolItem[]): SimilarPair[] {
  const topics = new Set(blueprintTopics(blueprint));
  const pairs: SimilarPair[] = [];
  for (const topicId of topics) {
    const items = pool.filter((q) => q.topicId === topicId && q.weight > 0).map((q) => ({ q, text: textOf(q.def) }));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const { q: a, text: ta } = items[i];
        const { q: b, text: tb } = items[j];
        if (a.groupKey && a.groupKey === b.groupKey) continue;
        if (a.conflictsWith?.includes(b.id) || b.conflictsWith?.includes(a.id)) continue;
        const score = similarity(ta, tb);
        if (score >= SIMILARITY_THRESHOLD) pairs.push({ a: a.id, b: b.id, topicId, score });
      }
    }
  }
  return pairs;
}

/** The pairs, worded as pool-health warnings. */
export function similarityIssues(pairs: readonly SimilarPair[], questionNames: Names = {}): PreflightIssue[] {
  const name = (id: string) => questionNames[id] ?? id;
  return pairs.map((p) => ({
    severity: "warning",
    code: "pool.near-identical",
    message: `“${name(p.a)}” and “${name(p.b)}” are ${fmtNum(Math.round(p.score * 100))}% the same text, so one student could get both. Put them in one variant group or mark them as conflicting.`,
  }));
}
