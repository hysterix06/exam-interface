import { difficultyLabel } from "./authoring/summary";
import { createRng, type Rng } from "./rng";

// Explainable adaptive selection. No statistics model: a student who answers
// correctly gets a harder question next, one who misses gets an easier one.
// Every step carries a plain-language reason, so an educator can follow it.

export interface AdaptiveCandidate {
  id: string;
  difficulty: number;
  weight: number;
  groupKey?: string | null;
}

export interface AdaptiveStep {
  /** 0-based position in the exam. */
  index: number;
  /** The level the rules asked for. */
  target: number;
  /** The question picked and the level it actually sits at. */
  questionId: string;
  level: number;
  /** Whether the previous answer was right (null for the first question). */
  previousCorrect: boolean | null;
  reason: string;
}

const lvl = (n: number) => `${difficultyLabel(n)} (level ${n})`;

/** Levels that exist in the pool, easiest first. */
export function levelsOf(pool: readonly AdaptiveCandidate[]) {
  return [...new Set(pool.map((q) => q.difficulty))].sort((a, b) => a - b);
}

/** Start in the middle of what's available (the lower middle when there's an even number). */
export function startLevel(levels: readonly number[]) {
  return levels[Math.floor((levels.length - 1) / 2)];
}

/** One level harder after a right answer, one easier after a wrong one, within the available levels. */
export function nextTarget(current: number, correct: boolean, levels: readonly number[]) {
  const i = levels.indexOf(current);
  const j = Math.min(levels.length - 1, Math.max(0, i + (correct ? 1 : -1)));
  return levels[j];
}

/**
 * Pick the next question: from the target level if any remain, otherwise the
 * nearest level (easier first on a tie). Within a level the draw is weighted,
 * exactly like the normal selector, and a variant group is used at most once.
 */
export function pickAdaptive(
  pool: readonly AdaptiveCandidate[],
  target: number,
  asked: ReadonlySet<string>,
  rng: Rng,
): { question: AdaptiveCandidate; note: string | null } | null {
  const usedGroups = new Set(pool.filter((q) => asked.has(q.id) && q.groupKey).map((q) => q.groupKey));
  const open = pool.filter((q) => q.weight > 0 && !asked.has(q.id) && !(q.groupKey && usedGroups.has(q.groupKey)));
  if (open.length === 0) return null;

  const levels = levelsOf(open);
  const chosen = levels.slice().sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
  const candidates = open.filter((q) => q.difficulty === chosen);
  // Weighted sampling: highest ln(u)/weight wins (same rule as selectQuestions).
  const best = candidates
    .map((q) => ({ q, key: Math.log(rng.fork(q.id).next() || Number.MIN_VALUE) / q.weight }))
    .sort((a, b) => b.key - a.key || a.q.id.localeCompare(b.q.id))[0].q;
  return {
    question: best,
    note: chosen === target ? null : `No ${difficultyLabel(target)} questions are left, so the closest level was used.`,
  };
}

export type Answerer = boolean[] | ((index: number, question: AdaptiveCandidate) => boolean);

/**
 * Walk a pretend student through the pool: who they would meet, in order, and
 * why. Deterministic for a given seed. Stops early if the pool runs out.
 */
export function simulateAdaptive(pool: readonly AdaptiveCandidate[], count: number, answers: Answerer, seed = "adaptive"): AdaptiveStep[] {
  const levels = levelsOf(pool.filter((q) => q.weight > 0));
  if (levels.length === 0) return [];
  const rng = createRng(seed);
  const asked = new Set<string>();
  const steps: AdaptiveStep[] = [];
  let target = startLevel(levels);
  let previous: boolean | null = null;

  for (let index = 0; index < count; index++) {
    const pick = pickAdaptive(pool, target, asked, rng.fork(`step:${index}`));
    if (!pick) break;
    const reason =
      (index === 0
        ? `Started at ${lvl(target)}, the middle of the available levels.`
        : previous
          ? `Answered correctly, so one level harder: target ${lvl(target)}.`
          : `Answered incorrectly, so one level easier: target ${lvl(target)}.`) + (pick.note ? ` ${pick.note}` : "");
    steps.push({ index, target, questionId: pick.question.id, level: pick.question.difficulty, previousCorrect: previous, reason });
    asked.add(pick.question.id);

    const correct = Array.isArray(answers) ? (answers[index] ?? false) : answers(index, pick.question);
    previous = correct;
    target = nextTarget(pick.question.difficulty, correct, levels);
  }
  return steps;
}
