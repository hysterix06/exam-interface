import type { AttemptPoolItem } from "../attempt";
import { getQuestionType } from "@/question-types/registry";

/** Used when a type gives no estimate of its own. */
const DEFAULT_SECONDS = 60;

/** Harder questions take longer to read and think through. */
const DIFFICULTY_FACTOR: Record<number, number> = { 1: 0.75, 2: 1, 3: 1.5 };

/**
 * Rough seconds one question takes: the type's rule of thumb (e.g. "30 s plus
 * 8 s per option") times the difficulty factor. A planning aid, never a limit.
 */
function estimateQuestionSeconds(q: Pick<AttemptPoolItem, "type" | "def" | "difficulty">): number {
  const type = getQuestionType(q.type);
  const parsed = type.defSchema.safeParse(q.def);
  const base = parsed.success && type.estimateSeconds ? type.estimateSeconds(parsed.data) : DEFAULT_SECONDS;
  return base * (DIFFICULTY_FACTOR[q.difficulty] ?? 1);
}

export function estimateSecondsById(pool: readonly AttemptPoolItem[]): Record<string, number> {
  return Object.fromEntries(pool.map((q) => [q.id, estimateQuestionSeconds(q)]));
}
