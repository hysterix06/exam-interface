import { describe, expect, it } from "vitest";
import type { GradeLine } from "../types";
import { expectedKeyScore, keyNeedsReview } from "./expect";

const line = (verdict: GradeLine["verdict"], points: number, max: number): GradeLine => ({ label: "x", expected: "", got: "", verdict, points, max });

describe("expectedKeyScore", () => {
  it("is full marks when nothing needs review", () => {
    expect(expectedKeyScore({ lines: [line("correct", 1, 1), line("correct", 2, 2)] }, 3)).toBe(3);
    expect(keyNeedsReview({ lines: [line("correct", 1, 1)] })).toBe(false);
  });

  it("is zero for a fully hand-marked answer", () => {
    expect(expectedKeyScore({ lines: [line("review", 0, 2 / 3), line("review", 0, 4 / 3)] }, 2)).toBe(0);
  });

  it("leaves out only the hand-marked share", () => {
    const r = { lines: [line("correct", 1.5, 1.5), line("review", 0, 1.5)] };
    expect(expectedKeyScore(r, 3)).toBe(1.5);
    expect(keyNeedsReview(r)).toBe(true);
  });
});
