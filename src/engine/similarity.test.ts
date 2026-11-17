import { describe, expect, it } from "vitest";
import { type SimilarityAttempt, findSimilarAttempts, shingleOverlap } from "./similarity";

const q = (questionId: string, tokens: readonly string[], key: readonly string[], text?: string) => ({ questionId, tokens, keyTokens: key, text });

function cohort(): SimilarityAttempt[] {
  // 20 students; most answer right. Two (a and b) share the same rare wrong answers.
  const out: SimilarityAttempt[] = [];
  for (let i = 0; i < 20; i++) out.push({ attemptId: `s${i}`, items: [q("q1", ["r1"], ["r1"]), q("q2", ["r2"], ["r2"]), q("q3", ["r3"], ["r3"]), q("q4", ["w4"], ["r4"])] });
  out.push({ attemptId: "a", items: [q("q1", ["x1"], ["r1"]), q("q2", ["x2"], ["r2"]), q("q3", ["x3"], ["r3"]), q("q4", ["w4"], ["r4"])] });
  out.push({ attemptId: "b", items: [q("q1", ["x1"], ["r1"]), q("q2", ["x2"], ["r2"]), q("q3", ["x3"], ["r3"]), q("q4", ["w4"], ["r4"])] });
  return out;
}

describe("findSimilarAttempts", () => {
  it("flags pairs sharing several uncommon wrong answers, and explains why", () => {
    const pairs = findSimilarAttempts(cohort());
    expect(pairs).toHaveLength(1);
    expect([pairs[0].a, pairs[0].b].sort()).toEqual(["a", "b"]);
    expect(pairs[0].reasons[0]).toMatch(/same uncommon wrong answer on 3 questions/);
    // A wrong answer half the class gave (w4) is common, so it isn't evidence.
    expect(pairs[0].evidence.map((e) => e.questionId)).toEqual(["q1", "q2", "q3"]);
  });

  it("ignores right answers and lone coincidences", () => {
    const c = cohort().map((a) => (a.attemptId === "b" ? { ...a, items: a.items.map((i) => (i.questionId === "q1" ? i : q(i.questionId, i.keyTokens, i.keyTokens))) } : a));
    expect(findSimilarAttempts(c)).toEqual([]);
  });

  it("flags long written answers that share most of their phrasing", () => {
    const essay = "the enzyme active site changes shape when it is heated above its optimum temperature so the substrate no longer fits and the rate falls quickly";
    const items = (t: string) => [{ questionId: "w", tokens: null, keyTokens: [], text: t }];
    const pairs = findSimilarAttempts([
      { attemptId: "a", items: items(essay) },
      { attemptId: "b", items: items(`${essay} as a result`) },
      { attemptId: "c", items: items("heat denatures proteins so they lose their shape and stop working in the cell which slows every reaction that depends on them") },
    ]);
    expect(pairs.map((p) => [p.a, p.b])).toEqual([["a", "b"]]);
    expect(pairs[0].reasons[0]).toMatch(/written answers .* share \d+% of their five-word phrases/);
  });

  it("measures phrase overlap", () => {
    expect(shingleOverlap("a b c d e f", "a b c d e f")).toBe(1);
    expect(shingleOverlap("a b c d e", "v w x y z")).toBe(0);
    expect(shingleOverlap("short", "short")).toBe(0);
  });
});
