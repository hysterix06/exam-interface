import { describe, expect, it } from "vitest";
import type { AttemptPoolItem } from "../attempt";
import { findSimilarQuestions, similarity, similarityIssues, textOf } from "./similar-questions";

const mcq = (stem: string, extra: Partial<AttemptPoolItem> = {}): AttemptPoolItem => ({
  id: stem.slice(0, 8),
  versionId: "v",
  topicId: "t",
  type: "mcq",
  weight: 1,
  difficulty: 2,
  points: 1,
  def: { stem, options: [{ id: "a", text: "Mitochondria", correct: true }, { id: "b", text: "Ribosome", correct: false }] },
  ...extra,
});
const BP = { sections: [{ topicId: "t", count: 1 }], shuffleQuestions: true };

describe("similarity", () => {
  it("is 1 for the same text and low for unrelated text", () => {
    expect(similarity("which organelle makes atp?", "which organelle makes atp?")).toBe(1);
    expect(similarity("which organelle makes atp?", "name a prime number")).toBeLessThan(0.2);
    expect(similarity("", "")).toBe(1);
    expect(similarity("ab", "cd")).toBe(0);
  });

  it("collects every string in a definition", () => {
    expect(textOf({ stem: "A  B", options: [{ text: "C" }], n: 3 })).toBe("a b c");
  });
});

describe("findSimilarQuestions", () => {
  const a = mcq("Which organelle produces most of a cell's ATP?", { id: "a" });
  const b = mcq("Which organelle produces most of the cell's ATP?", { id: "b" });
  const c = mcq("What does DNA polymerase do during replication?", { id: "c" });

  it("flags near-identical questions in a drawn topic", () => {
    const pairs = findSimilarQuestions(BP, [a, b, c]);
    expect(pairs.map((p) => [p.a, p.b])).toEqual([["a", "b"]]);
    const [issue] = similarityIssues(pairs, { a: "Q A", b: "Q B" });
    expect(issue).toMatchObject({ severity: "warning", code: "pool.near-identical" });
    expect(issue.message).toMatch(/“Q A” and “Q B” are \d+% the same text/);
  });

  it("skips pairs the author already separated, other topics, and unused questions", () => {
    expect(findSimilarQuestions(BP, [{ ...a, groupKey: "g" }, { ...b, groupKey: "g" }])).toEqual([]);
    expect(findSimilarQuestions(BP, [{ ...a, conflictsWith: ["b"] }, b])).toEqual([]);
    expect(findSimilarQuestions(BP, [a, { ...b, conflictsWith: ["a"] }])).toEqual([]);
    expect(findSimilarQuestions(BP, [a, { ...b, topicId: "other" }])).toEqual([]);
    expect(findSimilarQuestions(BP, [a, { ...b, weight: 0 }])).toEqual([]);
  });
});
