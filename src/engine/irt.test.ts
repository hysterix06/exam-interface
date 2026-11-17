import { describe, expect, it } from "vitest";
import { difficultyFromLevel, difficultyFromShare, eapAbility, pCorrect } from "./irt";

describe("Rasch", () => {
  it("gives 50% when ability equals difficulty", () => {
    expect(pCorrect(0, 0)).toBe(0.5);
    expect(pCorrect(1, 0)).toBeCloseTo(0.731, 3);
  });

  it("starts at the prior and moves with the answers", () => {
    expect(eapAbility([])).toEqual({ theta: 0, se: 1 });
    const up = eapAbility([{ b: 0, correct: true }]);
    const down = eapAbility([{ b: 0, correct: false }]);
    expect(up.theta).toBeGreaterThan(0);
    expect(down.theta).toBeCloseTo(-up.theta, 3);
    expect(up.se).toBeLessThan(1);
  });

  it("stays finite for all-right runs and grows more certain", () => {
    const all = eapAbility(Array.from({ length: 10 }, () => ({ b: 0, correct: true })));
    expect(all.theta).toBeGreaterThan(1);
    expect(all.theta).toBeLessThan(4);
    expect(all.se).toBeLessThan(eapAbility([{ b: 0, correct: true }]).se);
  });

  it("converts shares and levels to difficulties", () => {
    expect(difficultyFromShare(0.5)).toBe(0);
    expect(difficultyFromShare(0.88)).toBe(-1.99);
    expect(difficultyFromShare(1)).toBe(-2.94);
    expect(difficultyFromLevel(1)).toBe(-1);
    expect(difficultyFromLevel(3)).toBe(1);
  });
});
