// Every registered question type must pass this suite. Adding a type means
// adding fixtures for it in fixtures.ts; nothing here should need to change.
import { describe, expect, it } from "vitest";
import { sumPoints } from "@/engine/grading/format";
import { createRng } from "@/engine/rng";
import { fixturesByType } from "./fixtures";
import { questionTypes } from "./registry";

const SEEDS = 1000;
// Several values so shares like 2/3 can't hide rounding drift.
const POINT_VALUES = [1, 2, 3, 7, 0.5];

describe.each([...questionTypes.values()])("$id contract", (type) => {
  const fixtures = fixturesByType[type.id] ?? [];

  it("has fixtures", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  describe.each(fixtures.map((f, i) => [i, f] as const))("fixture %i", (_i, fixture) => {
    const def = type.defSchema.parse(fixture);

    it("is a valid definition with no blocking issues", () => {
      expect(type.validateDef(def).filter((i) => i.severity === "blocking")).toEqual([]);
    });

    it(`over ${SEEDS} seeds: deterministic, JSON-safe, key = max, blank = 0, random in range`, () => {
      for (let s = 0; s < SEEDS; s++) {
        const seed = `contract:${s}`;
        const { instance, vars } = type.generate(def, createRng(seed));
        expect(type.generate(def, createRng(seed))).toEqual({ instance, vars });

        // Instances are frozen as JSONB; they must survive the round trip.
        const frozen = JSON.parse(JSON.stringify(instance));
        expect(frozen).toEqual(instance);
        type.instanceSchema.parse(frozen);

        const POINTS = POINT_VALUES[s % POINT_VALUES.length];
        const key = type.keyResponse(frozen);
        type.responseSchema.parse(key);
        const best = type.grade(frozen, key, { points: POINTS });
        expect(best.score).toBe(POINTS);
        expect(best.max).toBe(POINTS);
        expect(sumPoints(best.lines)).toBe(best.score);

        const blank = type.grade(frozen, null, { points: POINTS });
        expect(blank.score).toBe(0);
        expect(blank.lines.every((l) => l.verdict === "unanswered")).toBe(true);

        const random = type.randomResponse(frozen, createRng(`${seed}:answer`));
        type.responseSchema.parse(random);
        const r = type.grade(frozen, random, { points: POINTS });
        expect(r.score).toBeLessThanOrEqual(POINTS);
        expect(r.score).toBeGreaterThanOrEqual(-POINTS);
        expect(sumPoints(r.lines)).toBe(r.score);
      }
    });

    it("redacts the answer key", () => {
      const { instance } = type.generate(def, createRng("redact"));
      const redacted = JSON.stringify(type.redact(instance));
      expect(redacted.length).toBeLessThan(JSON.stringify(instance).length);
      // The perfect response must not be recoverable verbatim from the redacted view
      // for types whose key is a distinct field.
      expect(type.redact(instance)).not.toEqual(instance);
    });
  });
});
