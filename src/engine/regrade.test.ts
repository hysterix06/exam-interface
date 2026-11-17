import { describe, expect, it } from "vitest";
import { canonical, compareReproduction, regradeItems } from "./regrade";
import { createRng, questionSeed } from "./rng";
import { getQuestionType } from "@/question-types/registry";
import { fixturesByType } from "@/question-types/fixtures";

describe("regradeItems", () => {
  const type = getQuestionType("mcq");
  const oldDef = type.defSchema.parse(fixturesByType["mcq"][0]); // "b" is correct
  const seed = "attempt-seed";
  const versionId = "v-old";
  const oldInstance = type.generate(oldDef, createRng(questionSeed(seed, versionId))).instance;
  const base = { attemptId: "a1", attemptSeed: seed, seedVersionId: versionId, type: "mcq", points: 1 };

  it("shows who gains and loses when the key changes, keeping each student's own option order", () => {
    // The author realises "a" (Nucleus) was the intended answer instead.
    const newDef = { ...oldDef, options: oldDef.options.map((o: { id: string }) => ({ ...o, correct: o.id === "a" })) };
    const diffs = regradeItems([
      { ...base, itemId: "i1", newDef, response: { selected: ["b"] }, oldScore: 1 },
      { ...base, itemId: "i2", attemptId: "a2", newDef, response: { selected: ["a"] }, oldScore: -0.25 },
      { ...base, itemId: "i3", attemptId: "a3", newDef, response: null, oldScore: 0 },
    ]);
    expect(diffs.map((d) => [d.oldScore, d.newScore, d.delta])).toEqual([
      [1, -0.25, -1.25],
      [-0.25, 1, 1.25],
      [0, 0, 0],
    ]);
    // Same seed, same order: the student sees the options as before.
    expect((diffs[0].instance as typeof oldInstance).options).toEqual(oldInstance.options);
  });

  it("is a no-op when nothing changed", () => {
    const [d] = regradeItems([{ ...base, itemId: "i", newDef: oldDef, response: { selected: oldInstance.key }, oldScore: 1 }]);
    expect(d.delta).toBe(0);
    expect(d.lines.length).toBeGreaterThan(0);
  });

  it("keeps the student's instance across repeated regrades (seeded from the original version)", () => {
    // Regrade 1: key moves to "a". Regrade 2: key moves to "c". Both use the original seed version.
    const keyed = (id: string) => ({ ...oldDef, options: oldDef.options.map((o: { id: string }) => ({ ...o, correct: o.id === id })) });
    const [first] = regradeItems([{ ...base, itemId: "i", newDef: keyed("a"), response: { selected: ["c"] }, oldScore: 0 }]);
    const [second] = regradeItems([{ ...base, itemId: "i", newDef: keyed("c"), response: { selected: ["c"] }, oldScore: first.newScore }]);
    expect((second.instance as typeof oldInstance).options).toEqual(oldInstance.options);
    expect(second.newScore).toBe(1);
  });

  it("treats a malformed saved answer as unanswered", () => {
    expect(regradeItems([{ ...base, itemId: "i", newDef: oldDef, response: { junk: 1 }, oldScore: 0 }])[0].newScore).toBe(0);
  });
});

describe("canonical", () => {
  it("ignores key order at every depth but not array order or values", () => {
    expect(canonical({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: null } })).toBe(canonical({ a: { c: null, d: [1, { x: 2, y: 1 }] }, b: 1 }));
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
    expect(canonical(undefined)).toBe("null");
  });
  it("treats a re-keyed copy as identical", () => {
    const r = compareReproduction({
      attemptSeed: "s",
      stored: [{ position: 0, seedVersionId: "v", questionVersionId: "v", instance: { z: 1, a: [{ q: 1, b: 2 }] } }],
      rebuilt: [{ position: 0, versionId: "v", instance: { a: [{ b: 2, q: 1 }], z: 1 } }],
    });
    expect(r.identical).toBe(true);
  });
});

describe("compareReproduction", () => {
  const stored = [{ position: 0, seedVersionId: "v1", questionVersionId: "v1", instance: { a: 1 } }, { position: 1, seedVersionId: "v2", questionVersionId: "v2", instance: { b: 2 } }];
  it("confirms an identical rebuild", () => {
    const r = compareReproduction({ attemptSeed: "s", stored, rebuilt: [{ position: 0, versionId: "v1", instance: { a: 1 } }, { position: 1, versionId: "v2", instance: { b: 2 } }] });
    expect(r).toEqual({ identical: true, differences: [], notes: [] });
  });
  it("names exactly what differs", () => {
    const r = compareReproduction({ attemptSeed: "s", stored, rebuilt: [{ position: 0, versionId: "vX", instance: { a: 1 } }, { position: 1, versionId: "v2", instance: { b: 9 } }] });
    expect(r.identical).toBe(false);
    expect(r.differences[0]).toMatch(/Position 1: a different question/);
    expect(r.differences[1]).toMatch(/Position 2: same question, but the generated content differs/);
  });
  it("notices a length mismatch", () => {
    expect(compareReproduction({ attemptSeed: "s", stored, rebuilt: [] }).differences[0]).toMatch(/has 2 questions but rebuilding gives 0/);
  });

  describe("after a regrade", () => {
    const type = getQuestionType("mcq");
    const oldDef = type.defSchema.parse(fixturesByType["mcq"][0]);
    const newDef = { ...oldDef, options: oldDef.options.map((o: { id: string }) => ({ ...o, correct: o.id === "a" })) };
    const seed = "attempt-seed";
    const original = type.generate(oldDef, createRng(questionSeed(seed, "v1"))).instance;
    const [regraded] = regradeItems([{ itemId: "i", attemptId: "a", attemptSeed: seed, seedVersionId: "v1", type: "mcq", newDef, response: null, points: 1, oldScore: 0 }]);
    const rebuilt = [{ position: 0, versionId: "v1", instance: original }];

    it("matches when the stored instance is the new version generated from the original seed", () => {
      const r = compareReproduction({
        attemptSeed: seed,
        stored: [{ position: 0, seedVersionId: "v1", questionVersionId: "v2", version: 2, type: "mcq", def: newDef, instance: regraded.instance }],
        rebuilt,
      });
      expect(r.identical).toBe(true);
      expect(r.notes[0]).toMatch(/Position 1: regraded to version 2; drawn and seeded identically/);
    });

    it("flags a regraded instance that no longer matches its seed", () => {
      const r = compareReproduction({
        attemptSeed: seed,
        stored: [{ position: 0, seedVersionId: "v1", questionVersionId: "v2", version: 2, type: "mcq", def: newDef, instance: { tampered: true } }],
        rebuilt,
      });
      expect(r.identical).toBe(false);
      expect(r.differences[0]).toMatch(/Position 1: regraded to version 2, but the stored content doesn't match/);
    });
  });
});
