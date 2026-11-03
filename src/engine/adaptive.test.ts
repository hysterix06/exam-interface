import { describe, expect, it } from "vitest";
import { type AdaptiveCandidate, levelsOf, nextTarget, pickAdaptive, simulateAdaptive, startLevel } from "./adaptive";
import { createRng } from "./rng";

const q = (id: string, difficulty: number, extra: Partial<AdaptiveCandidate> = {}): AdaptiveCandidate => ({ id, difficulty, weight: 1, ...extra });
const POOL = [q("e1", 1), q("e2", 1), q("m1", 2), q("m2", 2), q("h1", 3), q("h2", 3)];

describe("levels", () => {
  it("lists distinct levels easiest first and starts in the middle", () => {
    expect(levelsOf(POOL)).toEqual([1, 2, 3]);
    expect(startLevel([1, 2, 3])).toBe(2);
    expect(startLevel([1, 2])).toBe(1);
    expect(startLevel([3])).toBe(3);
  });
  it("steps one level up or down and stays inside the available levels", () => {
    expect(nextTarget(2, true, [1, 2, 3])).toBe(3);
    expect(nextTarget(2, false, [1, 2, 3])).toBe(1);
    expect(nextTarget(3, true, [1, 2, 3])).toBe(3);
    expect(nextTarget(1, false, [1, 2, 3])).toBe(1);
    // Skips a level that doesn't exist.
    expect(nextTarget(1, true, [1, 3])).toBe(3);
  });
});

describe("pickAdaptive", () => {
  const rng = (s: string) => createRng(s);
  it("draws from the target level when it has questions left", () => {
    const p = pickAdaptive(POOL, 3, new Set(), rng("a"))!;
    expect(p.question.difficulty).toBe(3);
    expect(p.note).toBeNull();
  });
  it("falls back to the closest level, easier first on a tie, and says so", () => {
    const p = pickAdaptive(POOL, 3, new Set(["h1", "h2"]), rng("b"))!;
    expect(p.question.difficulty).toBe(2);
    expect(p.note).toMatch(/No hard questions are left/);
    const tie = pickAdaptive([q("a", 1), q("c", 3)], 2, new Set(), rng("t"))!;
    expect(tie.question.id).toBe("a");
  });
  it("never repeats a question or a variant group, and ignores weight 0", () => {
    const pool = [q("x1", 2, { groupKey: "g" }), q("x2", 2, { groupKey: "g" }), q("z", 2, { weight: 0 })];
    expect(pickAdaptive(pool, 2, new Set(["x1"]), rng("g"))).toBeNull();
    expect(pickAdaptive(pool, 2, new Set(), rng("g"))!.question.id).not.toBe("z");
  });
  it("is weighted: a heavier question is drawn far more often", () => {
    const pool = [q("light", 2, { weight: 1 }), q("heavy", 2, { weight: 9 })];
    let heavy = 0;
    for (let i = 0; i < 1000; i++) if (pickAdaptive(pool, 2, new Set(), rng(`w${i}`))!.question.id === "heavy") heavy++;
    expect(heavy / 1000).toBeGreaterThan(0.85);
    expect(heavy / 1000).toBeLessThan(0.95);
  });
});

describe("simulateAdaptive", () => {
  it("climbs while the student keeps getting it right, and explains each step", () => {
    const steps = simulateAdaptive(POOL, 4, () => true);
    expect(steps.map((s) => s.level)).toEqual([2, 3, 3, 2]);
    expect(steps[0].reason).toBe("Started at medium (level 2), the middle of the available levels.");
    expect(steps[1].reason).toBe("Answered correctly, so one level harder: target hard (level 3).");
    // Both hard questions are used up by step 4, so the closest level is used.
    expect(steps[3].reason).toMatch(/No hard questions are left/);
  });

  it("drops while the student keeps missing", () => {
    const steps = simulateAdaptive(POOL, 4, () => false);
    expect(steps.map((s) => s.level)).toEqual([2, 1, 1, 2]);
    expect(steps[1].reason).toBe("Answered incorrectly, so one level easier: target easy (level 1).");
  });

  it("follows an explicit pattern and records what came before", () => {
    const steps = simulateAdaptive(POOL, 3, [true, false, true]);
    expect(steps.map((s) => s.previousCorrect)).toEqual([null, true, false]);
    expect(steps.map((s) => s.target)).toEqual([2, 3, 2]);
  });

  it("is deterministic, never repeats a question, and stops when the pool runs out", () => {
    const a = simulateAdaptive(POOL, 10, (i) => i % 2 === 0, "s");
    expect(simulateAdaptive(POOL, 10, (i) => i % 2 === 0, "s")).toEqual(a);
    expect(a).toHaveLength(6);
    expect(new Set(a.map((s) => s.questionId)).size).toBe(6);
  });

  it("copes with an empty pool and a single level", () => {
    expect(simulateAdaptive([], 3, () => true)).toEqual([]);
    expect(simulateAdaptive([q("a", 2, { weight: 0 })], 3, () => true)).toEqual([]);
    expect(simulateAdaptive([q("a", 2), q("b", 2)], 2, () => true).map((s) => s.level)).toEqual([2, 2]);
  });
});
