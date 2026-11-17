import { describe, expect, it } from "vitest";
import { type AdaptivePlan, nextAdaptive, replayAdaptive, type StepResult } from "./adaptive-live";

const items = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, versionId: `v${i}`, type: "mcq", points: 1, difficulty: (i % 3) + 1, weight: 1, groupKey: null, b: (i % 3) - 1 + i / 100 }));
const plan = (rule: AdaptivePlan["rule"]): AdaptivePlan => ({ rule, length: 6, threshold: 0.5, items, calibration: "levels" });

/** Walk a student who gets every answer right (or wrong) through the plan. */
function walk(p: AdaptivePlan, correct: (step: number) => boolean, seed = "s") {
  const history: StepResult[] = [];
  const asked = [];
  for (let i = 0; i < p.length; i++) {
    const n = nextAdaptive(seed, p, history)!;
    asked.push(n);
    history.push({ questionId: n.item.id, score: correct(i) ? 1 : 0, max: 1 });
  }
  return asked;
}

describe("live adaptive: staircase", () => {
  it("starts in the middle, climbs after right answers and drops after wrong ones", () => {
    const up = walk(plan("staircase"), () => true);
    // Four hard questions exist; once they are used, the nearest level (medium) fills in.
    expect(up.map((s) => s.item.difficulty)).toEqual([2, 3, 3, 3, 3, 2]);
    expect(up[5].trace.reason).toMatch(/closest level/);
    expect(up[1].trace.reason).toMatch(/earned 1 of 1, so one level harder/);
    const down = walk(plan("staircase"), () => false);
    expect(down[0].item.difficulty).toBe(2);
    expect(down[1].item.difficulty).toBe(1);
  });

  it("never repeats a question and is the same for the same seed", () => {
    const a = walk(plan("staircase"), (i) => i % 2 === 0);
    expect(new Set(a.map((s) => s.item.id)).size).toBe(6);
    expect(walk(plan("staircase"), (i) => i % 2 === 0).map((s) => s.item.id)).toEqual(a.map((s) => s.item.id));
  });
});

describe("live adaptive: Rasch", () => {
  it("asks harder questions as the ability estimate rises, and explains it", () => {
    const steps = walk(plan("rasch"), () => true);
    expect(steps[0].trace.ability!.theta).toBe(0);
    expect(steps[5].trace.ability!.theta).toBeGreaterThan(steps[1].trace.ability!.theta);
    expect(steps[5].item.b).toBeGreaterThanOrEqual(steps[0].item.b);
    expect(steps[2].trace.reason).toMatch(/ability estimate is .* ± .*closest/);
  });
});

describe("replayAdaptive", () => {
  it("confirms a recorded path and spots a tampered one", () => {
    const steps = walk(plan("staircase"), (i) => i < 3);
    const stored = steps.map((s, i) => ({ questionId: s.item.id, previous: i === 0 ? null : { questionId: steps[i - 1].item.id, score: i - 1 < 3 ? 1 : 0, max: 1 } }));
    expect(replayAdaptive("s", plan("staircase"), stored)).toEqual({ identical: true, differences: [] });
    const bad = stored.map((s, i) => (i === 2 ? { ...s, questionId: "q11" } : s));
    expect(replayAdaptive("s", plan("staircase"), bad).differences[0]).toMatch(/Position 3/);
  });
});
