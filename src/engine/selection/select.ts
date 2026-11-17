import type { Rng } from "../rng";
import {
  type Blueprint,
  type PoolItem,
  type SelectionPick,
  type SelectionResult,
  type SelectionSkip,
  sectionTopics,
  type TopicLimit,
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
  /** The section's topics when there is more than one (picks then say which). */
  topics: string[] | null;
  limits: Record<string, TopicLimit> | null;
}

function bucketsFor(blueprint: Blueprint, pool: readonly PoolItem[]): Bucket[] {
  return blueprint.sections.flatMap((section, sectionIndex): Bucket[] => {
    const topics = sectionTopics(section);
    const inTopic = pool.filter((q) => topics.includes(q.topicId) && q.weight > 0);
    const multi = topics.length > 1 ? topics : null;
    const limits = section.limits && Object.keys(section.limits).length ? section.limits : null;
    if (!section.difficultyMix) {
      return [{ sectionIndex, difficulty: null, count: section.count, items: inTopic, topics: multi, limits }];
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
        topics: multi,
        limits: null,
      }));
  });
}

/**
 * Weighted sampling without replacement (Efraimidis–Spirakis): each candidate
 * draws key = ln(u) / weight and the highest keys win. Every candidate's u
 * comes from a stream forked by its own id, so the result does not depend on
 * pool order. Variant groups and conflicts are enforced by skipping to the
 * next-ranked candidate; skips are recorded in the trace.
 *
 * Sections with per-topic limits first take each topic's minimum, best-ranked
 * first, then fill the rest by rank, passing over topics at their maximum.
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

    const perTopic = new Map<string, number>();
    // Within one bucket a skip is recorded once, even if limits look at it twice.
    const skipped = new Set<string>();
    let taken = 0;

    /** Take q if its group and conflicts allow; records a skip (once) otherwise. */
    const take = (q: PoolItem, i: number, via?: SelectionPick["via"]) => {
      if (chosen.has(q.id) || skipped.has(q.id)) return false;
      const groupOwner = q.groupKey ? usedGroups.get(q.groupKey) : undefined;
      const conflict = groupOwner ? null : conflictWith(q);
      if (groupOwner || conflict) {
        skipped.add(q.id);
        skips.push({
          questionId: q.id,
          sectionIndex: bucket.sectionIndex,
          reason: groupOwner ? "variant-group" : "conflict",
          because: (groupOwner ?? conflict)!,
        });
        return false;
      }
      chosen.set(q.id, q);
      if (q.groupKey) usedGroups.set(q.groupKey, q.id);
      perTopic.set(q.topicId, (perTopic.get(q.topicId) ?? 0) + 1);
      picks.push({
        questionId: q.id,
        sectionIndex: bucket.sectionIndex,
        difficulty: bucket.difficulty,
        rank: i + 1,
        candidates: ranked.length,
        weightShare: q.weight / totalWeight,
        ...(bucket.topics ? { topicId: q.topicId } : {}),
        ...(via ? { via } : {}),
      });
      taken++;
      return true;
    };

    if (bucket.limits) {
      const limits = bucket.limits;
      for (const topic of bucket.topics ?? Object.keys(limits)) {
        const min = limits[topic]?.min ?? 0;
        for (const [i, { q }] of ranked.entries()) {
          if ((perTopic.get(topic) ?? 0) >= min || taken === bucket.count) break;
          if (q.topicId === topic) take(q, i, "minimum");
        }
        if ((perTopic.get(topic) ?? 0) < min) {
          throw new BlueprintError(
            `Section ${bucket.sectionIndex + 1} needs at least ${min} from topic ${topic} but only ${perTopic.get(topic) ?? 0} could be drawn.`,
            bucket.sectionIndex,
          );
        }
      }
      for (const [i, { q }] of ranked.entries()) {
        if (taken === bucket.count) break;
        const max = limits[q.topicId]?.max;
        if (max !== undefined && (perTopic.get(q.topicId) ?? 0) >= max) continue;
        take(q, i, "rank");
      }
    } else {
      for (const [i, { q }] of ranked.entries()) {
        if (taken === bucket.count) break;
        take(q, i);
      }
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
