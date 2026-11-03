import { describe, expect, it } from "vitest";
import { createRng } from "@/engine/rng";
import { mcq, type McqDef } from "./core";
import { mcqFixtures } from "./fixtures";

const single = mcq.defSchema.parse(mcqFixtures[0]);

describe("mcq generate", () => {
  it("shuffles option order per seed but keeps the same options", () => {
    const orders = new Set<string>();
    for (let s = 0; s < 50; s++) {
      const { instance } = mcq.generate(single, createRng(`s${s}`));
      orders.add(instance.options.map((o) => o.id).join(""));
      expect(instance.options.map((o) => o.id).sort()).toEqual(["a", "b", "c", "d"]);
    }
    expect(orders.size).toBeGreaterThan(10);
  });

  it("keeps author order when shuffle is off", () => {
    const def = { ...single, shuffle: false };
    const { instance } = mcq.generate(def, createRng("x"));
    expect(instance.options.map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("drops negative marking on multi-select", () => {
    const def = { ...mcq.defSchema.parse(mcqFixtures[1]), penalty: 0.5 };
    expect(mcq.generate(def, createRng("x")).instance.penalty).toBe(0);
  });
});

describe("mcq grade", () => {
  const { instance } = mcq.generate(single, createRng("g"));

  it("applies the configured penalty", () => {
    expect(mcq.grade(instance, { selected: ["a"] }, { points: 4 }).score).toBe(-1);
    expect(mcq.grade(instance, { selected: ["b"] }, { points: 4 }).score).toBe(4);
  });

  it("explains the answer with option text", () => {
    const [line] = mcq.grade(instance, { selected: ["c"] }, { points: 1 }).lines;
    expect(line).toMatchObject({ expected: "Mitochondrion", got: "Ribosome", verdict: "wrong" });
  });
});

describe("mcq validateDef", () => {
  const codes = (def: Partial<McqDef>) =>
    mcq.validateDef(mcq.defSchema.parse({ ...mcqFixtures[0], ...def })).map((i) => i.code);

  it("catches a missing key", () => {
    expect(codes({ options: mcqFixtures[0].options.map((o) => ({ ...o, correct: false })) })).toContain(
      "mcq.no-correct-option",
    );
  });

  it("catches several keys on a single-answer question", () => {
    expect(codes({ options: mcqFixtures[0].options.map((o) => ({ ...o, correct: true })) })).toContain(
      "mcq.single-multiple-correct",
    );
  });

  it("catches empty and duplicate options", () => {
    const options = [
      { id: "a", text: "", correct: true },
      { id: "a", text: "Same", correct: false },
    ];
    expect(codes({ options })).toEqual(
      expect.arrayContaining(["mcq.empty-option", "mcq.duplicate-option-id"]),
    );
    expect(codes({ options: [{ id: "a", text: "x", correct: true }] })).toContain("mcq.too-few-options");
  });
});

describe("mcq redact", () => {
  it("removes the key and feedback", () => {
    const { instance } = mcq.generate(single, createRng("r"));
    const redacted = mcq.redact(instance) as Record<string, unknown>;
    expect(redacted).not.toHaveProperty("key");
    expect(redacted).not.toHaveProperty("feedback");
    expect(JSON.stringify(redacted)).not.toContain("correct");
  });
});
