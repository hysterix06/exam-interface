import { describe, expect, it } from "vitest";
import { analyseItems, chosenOptions, mean, MIN_SAMPLE, pearson, withDeadDistractors, type AnalysisAttempt } from "./analysis";

describe("pearson", () => {
  it("matches hand-computed values", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 10);
    // x=[1,2,3,4], y=[1,3,2,4]: r = 0.8
    expect(pearson([1, 2, 3, 4], [1, 3, 2, 4])).toBeCloseTo(0.8, 10);
  });
  it("is undefined without variation or enough data", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2, 3], [5, 5, 5])).toBeNull();
    expect(pearson([1], [1])).toBeNull();
    expect(pearson([1, 2], [1])).toBeNull();
  });
  it("mean of nothing is 0", () => expect(mean([])).toBe(0));
});

// Four students, three questions. Q1 is easy, Q2 separates strong from weak, Q3 is backwards.
const att = (id: string, q1: number, q2: number, q3: number, c2: string): AnalysisAttempt => ({
  attemptId: id,
  items: [
    { questionId: "Q1", score: q1, max: 1 },
    { questionId: "Q2", score: q2, max: 1, chosen: [c2] },
    { questionId: "Q3", score: q3, max: 1 },
  ],
});
const DATA = [att("a", 1, 1, 0, "right"), att("b", 1, 1, 0, "right"), att("c", 1, 0, 1, "wrongA"), att("d", 1, 0, 1, "wrongA")];

describe("analyseItems", () => {
  const stats = Object.fromEntries(analyseItems(DATA).map((s) => [s.questionId, s]));

  it("difficulty is the mean share of points earned", () => {
    expect(stats.Q1.difficulty).toBe(1);
    expect(stats.Q2.difficulty).toBe(0.5);
    expect(stats.Q1.n).toBe(4);
  });

  it("uses each student's score on the OTHER questions for discrimination", () => {
    // Q2 vs rest (Q1,Q3 mean): a=.5 b=.5 c=1 d=1 against 1,1,0,0 -> perfectly negative.
    expect(stats.Q2.discrimination).toBe(-1);
    // Q1 never varies, so it can't discriminate.
    expect(stats.Q1.discrimination).toBeNull();
  });

  it("flags problems in plain language", () => {
    expect(stats.Q1.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["too-easy", "small-sample"]));
    expect(stats.Q2.flags.map((f) => f.code)).toContain("negative-discrimination");
    expect(stats.Q2.flags.find((f) => f.code === "negative-discrimination")!.message).toMatch(/key may be wrong/);
  });

  it("splits distractor choices between the strongest and weakest students", () => {
    const d = Object.fromEntries(stats.Q2.distractors.map((x) => [x.optionId, x]));
    expect(d.right).toMatchObject({ count: 2, share: 0.5 });
    expect(d.wrongA.count).toBe(2);
    // groupSize = max(1, round(4 * 0.27)) = 1: top is student a/b (tie order stable), bottom is c/d.
    expect(d.right.upperShare + d.wrongA.upperShare).toBe(1);
    expect(d.right.lowerShare + d.wrongA.lowerShare).toBe(1);
  });

  it("drops the small-sample warning at MIN_SAMPLE students", () => {
    const many = Array.from({ length: MIN_SAMPLE }, (_, i) => att(`s${i}`, i % 2, i % 2, 1, "x"));
    expect(analyseItems(many).find((s) => s.questionId === "Q2")!.flags.map((f) => f.code)).not.toContain("small-sample");
  });

  it("flags too-hard and low discrimination", () => {
    const hard = Array.from({ length: 5 }, (_, i) => ({
      attemptId: `h${i}`,
      items: [{ questionId: "H", score: 0, max: 1 }, { questionId: "Z", score: i / 4, max: 1 }],
    }));
    const h = analyseItems(hard).find((s) => s.questionId === "H")!;
    expect(h.flags.map((f) => f.code)).toContain("too-hard");
    // W and Z are independent by construction (every combination twice): r is exactly 0.
    const W = [0, 0, 1, 1, 0, 0, 1, 1];
    const Z = [0, 1, 0, 1, 0, 1, 0, 1];
    const weak = W.map((w, i) => ({ attemptId: `w${i}`, items: [{ questionId: "W", score: w, max: 1 }, { questionId: "Z", score: Z[i], max: 1 }] }));
    const w = analyseItems(weak).find((s) => s.questionId === "W")!;
    expect(w.discrimination).toBe(0);
    expect(w.flags.map((f) => f.code)).toContain("low-discrimination");
  });

  it("copes with a single question and zero-point items", () => {
    const one = analyseItems([{ attemptId: "x", items: [{ questionId: "Q", score: 0, max: 0 }] }]);
    expect(one[0]).toMatchObject({ n: 1, difficulty: 0, discrimination: null });
    expect(analyseItems([])).toEqual([]);
  });
});

describe("withDeadDistractors / chosenOptions", () => {
  const stat = analyseItems(DATA).find((s) => s.questionId === "Q2")!;
  it("names options nobody picked, ignoring the key", () => {
    const out = withDeadDistractors(stat, ["right", "wrongA", "wrongB", "wrongC"], ["right"]);
    expect(out.flags.at(-1)).toMatchObject({ code: "dead-distractor" });
    expect(out.flags.at(-1)!.message).toMatch(/2 wrong options were never chosen/);
    expect(withDeadDistractors(stat, ["right", "wrongA"], ["right"])).toBe(stat);
    // With a single student there is nothing to conclude, so no flag.
    expect(withDeadDistractors({ ...stat, n: 1 }, ["right", "z"], ["right"])).toEqual({ ...stat, n: 1 });
  });
  it("reads each choice type's response shape", () => {
    expect(chosenOptions("mcq", { selected: ["a", "b"] })).toEqual(["a", "b"]);
    expect(chosenOptions("dropdown", { selected: "c" })).toEqual(["c"]);
    expect(chosenOptions("true-false", { value: false })).toEqual(["false"]);
    expect(chosenOptions("short-answer", { text: "x" })).toBeNull();
    expect(chosenOptions("mcq", null)).toBeNull();
  });
});
