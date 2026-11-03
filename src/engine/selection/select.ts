import type { Rng } from "../rng";
import type {
  Blueprint,
  PoolItem,
  SelectionPick,
  SelectionResult,
  SelectionSkip,
} from "./types";

export class BlueprintError extends Error {
  constructor(
    message: string,
    readonly sectionIndex: number,
  ) {
    super(message);
    this.name = "BlueprintError";
  }
}

interface Bucket {
  sectionIndex: number;
  difficulty: number | null;
  count: number;
  items: PoolItem[];
}

function bucketsFor(blueprint: Blueprint, pool: readonly PoolItem[]): Bucket[] {
  return blueprint.sections.flatMap((section, sectionIndex): Bucket[] => {
    const inTopic = pool.filter((q) => q.topicId === section.topicId && q.weight > 0);
    if (!section.difficultyMix) {
      return [{ sectionIndex, difficulty: null, count: section.count, items: inTopic }];
    }
    return Object.entries(section.difficultyMix)
      .map(([level, count]) => ({ level: Number(level), count }))
      .filter(({ count }) => count > 0)
      .sort((a, b) => a.level - b.level)
      .map(({ level, count }) => ({
        sectionIndex,
        difficulty: level,
        count,
        items: inTopic.filter((q) => q.difficulty === level),
      }));
  });
}

/**
 * Weighted sampling without replacement (Efraimidis–Spirakis): each candidate
 * draws key = ln(u) / weight and the highest keys win. Every candidate's u
 * comes from a stream forked by its own id, so the result does not depend on
 * pool order. Variant groups and conflicts are enforced by skipping to the
 * next-ranked candidate; skips are recorded in the trace.
 */
export function selectQuestions(
  blueprint: Blueprint,
  pool: readonly PoolItem[],
  rng: Rng,
): SelectionResult {
  const picks: SelectionPick[] = [];
  const skips: SelectionSkip[] = [];
  const chosen = new Map<string, PoolItem>();
  const usedGroups = new Map<string, string>();

  const conflictWith = (q: PoolItem) => {
    for (const other of chosen.values()) {
      if (q.conflictsWith?.includes(other.id) || other.conflictsWith?.includes(q.id)) {
        return other.id;
      }
    }
    return null;
  };

  for (const [bucketIndex, bucket] of bucketsFor(blueprint, pool).entries()) {
    const bucketRng = rng.fork(`bucket:${bucketIndex}`);
    const totalWeight = bucket.items.reduce((s, q) => s + q.weight, 0);
    const ranked = bucket.items
      .map((q) => ({ q, key: Math.log(bucketRng.fork(q.id).next() || Number.MIN_VALUE) / q.weight }))
      .sort((a, b) => b.key - a.key || a.q.id.localeCompare(b.q.id));

    let taken = 0;
    for (const [i, { q }] of ranked.entries()) {
      if (taken === bucket.count) break;
      if (chosen.has(q.id)) continue;

      const groupOwner = q.groupKey ? usedGroups.get(q.groupKey) : undefined;
      if (groupOwner) {
        skips.push({ questionId: q.id, sectionIndex: bucket.sectionIndex, reason: "variant-group", because: groupOwner });
        continue;
      }
      const conflict = conflictWith(q);
      if (conflict) {
        skips.push({ questionId: q.id, sectionIndex: bucket.sectionIndex, reason: "conflict", because: conflict });
        continue;
      }

      chosen.set(q.id, q);
      if (q.groupKey) usedGroups.set(q.groupKey, q.id);
      picks.push({
        questionId: q.id,
        sectionIndex: bucket.sectionIndex,
        difficulty: bucket.difficulty,
        rank: i + 1,
        candidates: ranked.length,
        weightShare: q.weight / totalWeight,
      });
      taken++;
    }

    if (taken < bucket.count) {
      const level = bucket.difficulty === null ? "" : ` at difficulty ${bucket.difficulty}`;
      throw new BlueprintError(
        `Section ${bucket.sectionIndex + 1} needs ${bucket.count} question(s)${level} but only ${taken} could be drawn ` +
          `(${bucket.items.length} available before variant groups and conflicts).`,
        bucket.sectionIndex,
      );
    }
  }

  const ordered = picks.map((p) => p.questionId);
  const questionIds = blueprint.shuffleQuestions ? rng.fork("order").shuffle(ordered) : ordered;
  return { questionIds, trace: { picks, skips, shuffled: blueprint.shuffleQuestions } };
}
