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

describe("significant figures", () => {
  const sf = def({ stem: "{a} / {b}?", answer: "a / b", constraints: ["b != 3"], sigFigs: { count: 3, weight: 0.25 } });
  const inst = { stem: "", answer: 2 / 7, abs: 0, rel: 0, working: "", sigFigs: { count: 3, weight: 0.25 } };

  it("splits the points: value, then figures", () => {
    const r = numeric.grade(inst, { text: "0.286" }, { points: 4 });
    expect(r.lines.map((l) => [l.label, l.verdict, l.points, l.max])).toEqual([
      ["Answer", "correct", 3, 3],
      ["Significant figures", "correct", 1, 1],
    ]);
    expect(r.score).toBe(4);
  });

  it("gives the value but not the figures for an unrounded answer", () => {
    const r = numeric.grade(inst, { text: String(2 / 7) }, { points: 4 });
    expect(r.lines.map((l) => l.verdict)).toEqual(["correct", "wrong"]);
    expect(r.score).toBe(3);
  });

  it("gives the figures but not the value for a wrong number of the right shape", () => {
    const r = numeric.grade(inst, { text: "0.300" }, { points: 4 });
    expect(r.lines.map((l) => l.verdict)).toEqual(["wrong", "correct"]);
  });

  it("explains ambiguous trailing zeros and counts both lines as unanswered when blank", () => {
    const big = { ...inst, answer: 1200 };
    const r = numeric.grade(big, { text: "1200" }, { points: 4 });
    expect(r.lines[1].note).toMatch(/could be significant or not/);
    expect(numeric.grade(inst, null, { points: 4 }).lines.map((l) => l.verdict)).toEqual(["unanswered", "unanswered"]);
  });

  it("keys to the rounded figure and stays out of older instances", () => {
    expect(numeric.keyResponse(inst)).toEqual({ text: "0.286" });
    const { instance } = numeric.generate(def(), createRng("x"));
    expect(instance).not.toHaveProperty("sigFigs");
    expect(numeric.generate(sf, createRng("x")).instance).toHaveProperty("sigFigs");
  });
});
