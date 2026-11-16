import { describe, expect, it } from "vitest";
import { OVERRIDE_LABEL, overrideLines } from "./override";
import type { GradeLine } from "./types";

const sum = (ls: GradeLine[]) => ls.reduce((s, l) => s + l.points, 0);
const auto: GradeLine[] = [
  { label: "Blank 1", expected: "4", got: "4", verdict: "correct", points: 1, max: 1 },
  { label: "Blank 2", expected: "7", got: "8", verdict: "wrong", points: 0, max: 1 },
];

describe("overrideLines", () => {
  it("adds one adjustment line so the lines still sum to the new score", () => {
    const ls = overrideLines(auto, { score: 1.5, max: 2, by: "Ada", reason: "Blank 2 was ambiguous" });
    expect(ls).toHaveLength(3);
    expect(sum(ls)).toBe(1.5);
    const last = ls.at(-1)!;
    expect(last.label).toBe(OVERRIDE_LABEL);
    expect(last.points).toBe(0.5);
    expect(last.max).toBe(0);
    expect(last.got).toBe("Changed by Ada: Blank 2 was ambiguous");
    expect(last.expected).toBe("1 / 2 from the lines above");
    expect(last.verdict).toBe("partial");
  });

  it("replaces an earlier override instead of stacking them", () => {
    const once = overrideLines(auto, { score: 2, max: 2, by: "Ada", reason: "first" });
    const twice = overrideLines(once, { score: 0, max: 2, by: "Bo", reason: "second" });
    expect(twice.filter((l) => l.label === OVERRIDE_LABEL)).toHaveLength(1);
    expect(sum(twice)).toBe(0);
    expect(twice.at(-1)!.verdict).toBe("wrong");
    expect(once.at(-1)!.verdict).toBe("correct");
  });

  it("can lower a score and handles floating point", () => {
    const ls = overrideLines([{ label: "A", expected: "", got: "", verdict: "partial", points: 0.1 + 0.2, max: 1 }], { score: 0.1, max: 1, by: "Ada", reason: "r" });
    expect(ls.at(-1)!.points).toBe(-0.2);
  });
});
