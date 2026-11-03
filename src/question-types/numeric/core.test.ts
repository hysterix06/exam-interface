import { describe, expect, it } from "vitest";
import { evalCondition, evalNumber } from "@/engine/expr";
import { createRng } from "@/engine/rng";
import { drawValues, fillStem, numeric, type NumericDef } from "./core";

const def = (over: Partial<NumericDef> = {}): NumericDef =>
  numeric.defSchema.parse({
    stem: "{a} + {b}?",
    variables: [
      { kind: "int", name: "a", min: 1, max: 9 },
      { kind: "int", name: "b", min: 1, max: 9 },
    ],
    answer: "a + b",
    ...over,
  });

describe("evalNumber / evalCondition", () => {
  it("evaluates formulas and strips float noise", () => {
    expect(evalNumber("0.1 + 0.2", {})).toBe(0.3);
    expect(evalNumber("sqrt(x) * 2", { x: 16 })).toBe(8);
    expect(evalCondition("a < b", { a: 1, b: 2 })).toBe(true);
  });
  it("turns bad input into friendly errors", () => {
    expect(() => evalNumber("1 / 0", {})).toThrow(/finite number/);
    expect(() => evalNumber("1 +", {})).toThrow(/Can't calculate/);
    expect(() => evalNumber("unknownVar + 1", {})).toThrow(/Can't calculate/);
    expect(() => evalNumber("a > b", { a: 1, b: 2 })).toThrow(/finite number/);
    expect(() => evalCondition("a + b", { a: 1, b: 2 })).toThrow(/yes\/no/);
    expect(() => evalCondition("1 +", {})).toThrow(/Can't check/);
  });
  it("blocks anything that could escape the formula sandbox", () => {
    for (const bad of ["import({x: 1})", "createUnit('foo')", 'evaluate("1+1")', 'parse("1+1")', 'simplify("x+x")']) {
      expect(() => evalNumber(bad, {})).toThrow();
    }
  });
});

describe("drawValues", () => {
  it("honours constraints, including ones on the answer", () => {
    const d = def({ constraints: ["a != b", "answer == round(answer)", "answer < 12"] });
    for (let s = 0; s < 200; s++) {
      const r = drawValues(d, createRng(`c${s}`));
      expect(r.values.a).not.toBe(r.values.b);
      expect(r.answer).toBeLessThan(12);
    }
  });

  it("retries past division by zero instead of failing", () => {
    const d = numeric.defSchema.parse({
      stem: "{a}/{b}",
      variables: [{ kind: "int", name: "a", min: 1, max: 5 }, { kind: "int", name: "b", min: 0, max: 1 }],
      answer: "a / b",
    });
    for (let s = 0; s < 100; s++) expect(drawValues(d, createRng(`z${s}`)).values.b).toBe(1);
  });

  it("is deterministic and reports tries", () => {
    const d = def({ constraints: ["a == 1"] });
    const one = drawValues(d, createRng("same"));
    expect(drawValues(d, createRng("same"))).toEqual(one);
    expect(one.tries).toBeGreaterThanOrEqual(1);
  });

  it("gives up with a plain explanation when constraints are impossible", () => {
    expect(() => drawValues(def({ constraints: ["a > 100"] }), createRng("x"))).toThrow(/Couldn't generate.*Loosen the constraints/);
    expect(() => drawValues(def({ answer: "1 / 0" }), createRng("x"))).toThrow(/finite number/);
  });

  it("uses numeric pick options as numbers and text options as text", () => {
    const d = numeric.defSchema.parse({
      stem: "{who} buys {n}",
      variables: [{ kind: "pick", name: "who", options: ["Ann"] }, { kind: "pick", name: "n", options: ["4"] }],
      answer: "n * 2",
    });
    const { instance, vars } = numeric.generate(d, createRng("p"));
    expect(instance.stem).toBe("Ann buys 4");
    expect(vars).toMatchObject({ who: "Ann", n: "4", answer: 8 });
  });
});

describe("numeric type", () => {
  const d = def({ tolerance: { abs: 0.5 }, units: ["kg"] });
  const { instance } = numeric.generate(d, createRng("g"));

  it("grades by tolerance and explains the working", () => {
    const right = numeric.grade(instance, { text: `${instance.answer + 0.4} kg` }, { points: 2 });
    expect(right.score).toBe(2);
    expect(right.lines[0].note).toMatch(/with a = \d+, b = \d+ gives/);
    expect(numeric.grade(instance, { text: `${instance.answer + 2} kg` }, { points: 2 }).score).toBe(0);
  });

  it("requires accepted units and a number", () => {
    expect(numeric.grade(instance, { text: String(instance.answer) }, { points: 1 }).lines[0].note).toMatch(/needs a unit/);
    expect(numeric.grade(instance, { text: `${instance.answer} lb` }, { points: 1 }).lines[0].note).toMatch(/not accepted/);
    expect(numeric.grade(instance, { text: "lots" }, { points: 1 }).lines[0].note).toMatch(/Not a number/);
  });

  it("hides everything but the question from students", () => {
    expect(numeric.redact(instance)).toEqual({ stem: instance.stem });
  });

  it("fillStem leaves unknown placeholders alone", () => {
    expect(fillStem("{a} and {zzz}", { a: 1.5 })).toBe("1.5 and {zzz}");
  });
});

describe("validateDef", () => {
  const codes = (x: NumericDef) => numeric.validateDef(x).map((i) => i.code);

  it("accepts a good definition", () => expect(numeric.validateDef(def())).toEqual([]));

  it("catches authoring mistakes in plain language", () => {
    expect(codes(def({ stem: " ", answer: " " }))).toEqual(expect.arrayContaining(["numeric.empty-stem", "numeric.no-answer"]));
    expect(codes(def({ variables: [{ kind: "int", name: "1x", min: 1, max: 2 }, { kind: "int", name: "e", min: 1, max: 2 }] }))).toEqual(
      expect.arrayContaining(["numeric.bad-name", "numeric.reserved-name"]),
    );
    expect(codes(def({ variables: [{ kind: "int", name: "a", min: 5, max: 1 }, { kind: "int", name: "a", min: 1.5, max: 2 }] }))).toEqual(
      expect.arrayContaining(["numeric.bad-range", "numeric.duplicate-name", "numeric.int-range"]),
    );
    expect(codes(def({ variables: [{ kind: "pick", name: "a", options: [" "] }, { kind: "int", name: "b", min: 1, max: 2 }] }))).toContain("numeric.no-options");
    expect(codes(def({ stem: "{a} and {ghost}" }))).toContain("numeric.unknown-placeholder");
  });

  it("proves generation works, and says so when it can't", () => {
    expect(numeric.validateDef(def({ constraints: ["a > 100"] }))[0]).toMatchObject({ code: "numeric.generation-fails" });
    // A formula that sometimes divides by zero is fine: those draws are retried.
    expect(numeric.validateDef(def({ answer: "a / (b - 5)" }))).toEqual([]);
    // Satisfiable but rare (1 in 81 per draw): some seeds run out of tries.
    expect(numeric.validateDef(def({ constraints: ["a == 1", "b == 1"] }))[0].message).toMatch(/of 100 test generations failed/);
    // Common enough to always work, but wasteful.
    expect(numeric.validateDef(def({ constraints: ["a == 1"] })).map((i) => i.code)).toEqual(["numeric.many-retries"]);
  });
});
