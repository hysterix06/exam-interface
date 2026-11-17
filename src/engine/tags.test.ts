import { describe, expect, it } from "vitest";
import { bloomCoverage, masteryByObjective, parseTags, setBloom, setObjectives } from "./tags";

describe("tag conventions", () => {
  it("splits Bloom level and objectives from free tags", () => {
    expect(parseTags(["bloom:apply", "lo:BIO-3", "lo:BIO-4", "recall"])).toEqual({ bloom: "apply", objectives: ["BIO-3", "BIO-4"], other: ["recall"] });
    expect(parseTags(["bloom:nonsense", "x"])).toEqual({ bloom: null, objectives: [], other: ["bloom:nonsense", "x"] });
  });

  it("writes them back, replacing what was there", () => {
    expect(setBloom(["bloom:remember", "x"], "analyze")).toEqual(["x", "bloom:analyze"]);
    expect(setBloom(["bloom:remember", "x"], null)).toEqual(["x"]);
    expect(setObjectives(["lo:A", "x"], ["B", " ", "B"])).toEqual(["x", "lo:B"]);
  });
});

describe("bloomCoverage", () => {
  it("expects each level per student from how often questions are drawn", () => {
    const pool = [
      { id: "a", tags: ["bloom:remember"] },
      { id: "b", tags: ["bloom:apply"] },
      { id: "c", tags: [] },
    ];
    const c = bloomCoverage(pool, { runs: 10, failures: 0, drawn: { a: 10, b: 5, c: 10 } });
    expect(c.levels).toEqual([
      { level: "remember", expected: 1 },
      { level: "apply", expected: 0.5 },
    ]);
    expect(c.untagged).toBe(1);
    expect(c.sentence).toBe("Per student, on average: 1 remember, 0.5 apply; 1 untagged.");
    expect(bloomCoverage([], { runs: 0, failures: 0, drawn: {} }).sentence).toBeNull();
  });
});

describe("masteryByObjective", () => {
  it("adds up points per objective; a question can count toward several", () => {
    const m = masteryByObjective([
      { tags: ["lo:A", "lo:B"], score: 1, max: 2, needsReview: false },
      { tags: ["lo:A"], score: 2, max: 2, needsReview: false },
      { tags: [], score: 1, max: 1, needsReview: false },
    ]);
    expect(m.topics.map((t) => [t.name, t.score, t.max])).toEqual([
      ["A", 3, 4],
      ["B", 1, 2],
    ]);
  });
});
