// Structured tags on top of free-form ones: "bloom:<level>" for Bloom's
// taxonomy and "lo:<code>" for learning objectives. Stored in the same tags
// column, so nothing else has to change, and always readable as plain text.
import type { OddsResult } from "./authoring/simulate";
import { fmtNum } from "./grading/format";
import { topicMastery } from "./mastery";

export const BLOOM_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

const BLOOM = "bloom:";
const LO = "lo:";

export function parseTags(tags: readonly string[]): { bloom: BloomLevel | null; objectives: string[]; other: string[] } {
  let bloom: BloomLevel | null = null;
  const objectives: string[] = [];
  const other: string[] = [];
  for (const t of tags) {
    const level = t.startsWith(BLOOM) ? t.slice(BLOOM.length) : null;
    if (level && (BLOOM_LEVELS as readonly string[]).includes(level)) bloom = level as BloomLevel;
    else if (t.startsWith(LO) && t.length > LO.length) objectives.push(t.slice(LO.length));
    else other.push(t);
  }
  return { bloom, objectives, other };
}

export function setBloom(tags: readonly string[], level: BloomLevel | null): string[] {
  const rest = tags.filter((t) => !t.startsWith(BLOOM));
  return level ? [...rest, `${BLOOM}${level}`] : rest;
}

export function setObjectives(tags: readonly string[], objectives: readonly string[]): string[] {
  const rest = tags.filter((t) => !t.startsWith(LO));
  const clean = [...new Set(objectives.map((o) => o.trim()).filter(Boolean))];
  return [...rest, ...clean.map((o) => `${LO}${o}`)];
}

/**
 * How many questions of each Bloom level a student gets on average, from the
 * selector's own draw counts (the same odds as "appears on N% of exams").
 */
export function bloomCoverage(pool: readonly { id: string; tags?: readonly string[] }[], odds: OddsResult) {
  const ok = odds.runs - odds.failures;
  const per = new Map<BloomLevel | null, number>();
  for (const q of pool) {
    const n = ok > 0 ? (odds.drawn[q.id] ?? 0) / ok : 0;
    if (n === 0) continue;
    const level = parseTags(q.tags ?? []).bloom;
    per.set(level, (per.get(level) ?? 0) + n);
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  const levels = BLOOM_LEVELS.filter((l) => per.has(l)).map((level) => ({ level, expected: round(per.get(level)!) }));
  const untagged = round(per.get(null) ?? 0);
  const sentence = levels.length
    ? `Per student, on average: ${levels.map((l) => `${fmtNum(l.expected)} ${l.level}`).join(", ")}${untagged ? `; ${fmtNum(untagged)} untagged` : ""}.`
    : null;
  return { levels, untagged, sentence };
}

/** Points per learning objective, the same plain sums as topic mastery. A question counts toward each of its objectives. */
export function masteryByObjective(items: readonly { tags: readonly string[]; score: number; max: number; needsReview: boolean }[]) {
  return topicMastery(
    items.flatMap((i) => parseTags(i.tags).objectives.map((o) => ({ topicId: o, topicName: o, score: i.score, max: i.max, needsReview: i.needsReview }))),
  );
}
