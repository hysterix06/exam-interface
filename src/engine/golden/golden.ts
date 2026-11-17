import { buildAttempt, type AttemptPoolItem } from "../attempt";
import { canonical } from "../regrade";
import { cyrb128 } from "../rng";
import type { Blueprint } from "../selection/types";

export interface GoldenCase {
  name: string;
  seed: string;
  blueprint: Blueprint;
  pool: AttemptPoolItem[];
}

const SEEDS = Array.from({ length: 10 }, (_, i) => `golden:${i}`);

/** Pool built from a frozen copy of the fixtures: one question per fixture. */
function poolOf(fixtures: Record<string, unknown[]>): AttemptPoolItem[] {
  const pool: AttemptPoolItem[] = [];
  for (const [type, defs] of Object.entries(fixtures)) {
    defs.forEach((def, i) => {
      pool.push({
        id: `${type}:${i}`,
        versionId: `v:${type}:${i}`,
        topicId: i % 2 === 0 ? "even" : "odd",
        weight: 1 + (i % 3),
        difficulty: 1 + (pool.length % 3),
        points: 1 + (i % 4),
        type,
        def,
      });
    });
  }
  return pool;
}

export function goldenCases(fixtures: Record<string, unknown[]>): GoldenCase[] {
  const pool = poolOf(fixtures);
  const even = pool.filter((q) => q.topicId === "even").length;
  const odd = pool.filter((q) => q.topicId === "odd").length;
  const cases: GoldenCase[] = [];
  for (const seed of SEEDS) {
    // Every question, so every fixture's generator is pinned.
    cases.push({ name: `all/${seed}`, seed, pool, blueprint: { shuffleQuestions: true, sections: [{ topicId: "even", count: even }, { topicId: "odd", count: odd }] } });
    cases.push({ name: `draw/${seed}`, seed, pool, blueprint: { shuffleQuestions: false, sections: [{ topicId: "even", count: 3 }] } });
    cases.push({ name: `mix/${seed}`, seed, pool, blueprint: { shuffleQuestions: true, sections: [{ topicId: "odd", count: 3, difficultyMix: { "1": 1, "2": 1, "3": 1 } }] } });
  }
  return cases;
}

export function digestCase(c: GoldenCase): string {
  const built = buildAttempt(c.seed, c.blueprint, c.pool);
  return cyrb128(canonical(built)).map((n) => n.toString(16).padStart(8, "0")).join("");
}
