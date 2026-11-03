import { describe, expect, it } from "vitest";
import { scoreOrder } from "@/engine/grading/order";
import { createRng } from "@/engine/rng";
import { matching } from "./matching/core";
import { ordering } from "./ordering/core";

describe("scoreOrder", () => {
  const key = ["a", "b", "c", "d"];
  it("scores perfect, reversed and one swap", () => {
    expect(scoreOrder(key, key).fraction).toBe(1);
    expect(scoreOrder(key, [...key].reverse()).fraction).toBe(0);
    // b,a,c,d: 5 of 6 pairs are in the right order.
    expect(scoreOrder(key, ["b", "a", "c", "d"])).toMatchObject({ concordant: 5, pairs: 6 });
  });
  it("ignores unknown and repeated ids, and gives nothing for missing items", () => {
    expect(scoreOrder(key, ["a", "a", "zzz", "b"])).toMatchObject({ concordant: 1, placed: 2 });
    expect(scoreOrder(key, null).fraction).toBe(0);
  });
  it("handles a single item", () => {
    expect(scoreOrder(["a"], ["a"]).fraction).toBe(1);
    expect(scoreOrder(["a"], []).fraction).toBe(0);
  });
});

describe("ordering", () => {
  const def = ordering.defSchema.parse({
    stem: "Order",
    items: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }],
  });

  it("never presents the items already in the correct order", () => {
    for (let s = 0; s < 300; s++) {
      const { instance } = ordering.generate(def, createRng(`o${s}`));
      expect(instance.items.map((i) => i.id)).not.toEqual(instance.key);
    }
  });

  it("explains partial credit in pairs", () => {
    const { instance } = ordering.generate(def, createRng("p"));
    const r = ordering.grade(instance, { order: ["b", "a", "c"] }, { points: 3 });
    expect(r.score).toBe(2);
    expect(r.lines[0].verdict).toBe("partial");
    expect(r.lines[0].note).toMatch(/2 of 3 pairs/);
  });

  it("marks a reversed answer wrong and a blank unanswered", () => {
    const { instance } = ordering.generate(def, createRng("q"));
    expect(ordering.grade(instance, { order: ["c", "b", "a"] }, { points: 1 }).lines[0].verdict).toBe("wrong");
    expect(ordering.grade(instance, { order: [] }, { points: 1 }).lines[0].verdict).toBe("unanswered");
  });

  it("flags bad definitions", () => {
    const codes = (d: unknown) => ordering.validateDef(ordering.defSchema.parse(d)).map((i) => i.code);
    expect(codes({ stem: "", items: [{ id: "a", text: "" }] })).toEqual(
      expect.arrayContaining(["ordering.empty-stem", "ordering.too-few-items", "ordering.empty-item"]),
    );
    expect(codes({ stem: "x", items: [{ id: "a", text: "Same" }, { id: "a", text: "same" }] })).toEqual(
      expect.arrayContaining(["ordering.duplicate-id", "ordering.duplicate-text"]),
    );
  });
});

describe("matching", () => {
  const def = matching.defSchema.parse({
    stem: "Match",
    pairs: [
      { id: "a", left: "L1", right: "R1" },
      { id: "b", left: "L2", right: "R2" },
      { id: "c", left: "L3", right: "R3" },
      { id: "d", left: "L4", right: "R4" },
    ],
    distractors: ["Extra"],
  });
  const { instance } = matching.generate(def, createRng("m"));

  it("gives each pair an equal share and explains each line", () => {
    const r = matching.grade(instance, { matches: { a: "a", b: "a", c: "c" } }, { points: 4 });
    expect(r.score).toBe(2);
    const by = Object.fromEntries(r.lines.map((l) => [l.label, l]));
    expect(by.L1.verdict).toBe("correct");
    expect(by.L2).toMatchObject({ verdict: "wrong", expected: "R2", got: "R1" });
    expect(by.L4.verdict).toBe("unanswered");
  });

  it("includes distractors on the right but never as a key", () => {
    expect(instance.rights).toHaveLength(5);
    expect(Object.values(instance.key).every((v) => !v.startsWith("x"))).toBe(true);
  });

  it("blank answers are all unanswered", () => {
    expect(matching.grade(instance, null, { points: 1 }).lines.every((l) => l.verdict === "unanswered")).toBe(true);
  });

  it("flags ambiguous right-hand choices", () => {
    const issues = matching.validateDef(
      matching.defSchema.parse({ stem: "x", pairs: [{ id: "a", left: "A", right: "Same" }, { id: "b", left: "B", right: "same" }] }),
    );
    expect(issues.map((i) => i.code)).toContain("matching.ambiguous-right");
    const bad = matching.validateDef(matching.defSchema.parse({ stem: "", pairs: [{ id: "a", left: "", right: "" }], distractors: [" "] }));
    expect(bad.map((i) => i.code)).toEqual(
      expect.arrayContaining(["matching.empty-stem", "matching.too-few-pairs", "matching.empty-pair", "matching.empty-distractor"]),
    );
  });
});
