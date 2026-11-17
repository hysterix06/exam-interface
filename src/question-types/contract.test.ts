// Every registered question type must pass this suite. Adding a type means
// adding fixtures for it in fixtures.ts; nothing here should need to change.
import { describe, expect, it } from "vitest";
import { expectedKeyScore, keyNeedsReview } from "@/engine/grading/expect";
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

  it("offers a wrong-answer run and a time estimate", () => {
    // Hand-marked types can't be "wrong" by machine; everything else must say how.
    if (!type.manual) expect(type.wrongResponse).toBeTypeOf("function");
    expect(type.estimateSeconds).toBeTypeOf("function");
    for (const f of fixtures) expect(type.estimateSeconds!(type.defSchema.parse(f))).toBeGreaterThan(0);
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
        expect(best.max).toBe(POINTS);
        expect(sumPoints(best.lines)).toBe(best.score);
        // Every point a machine can award, it must award; hand-marked lines
        // ("review") wait for a person and flag the answer.
        expect(best.score).toBe(expectedKeyScore(best, POINTS));
        expect(best.needsReview).toBe(keyNeedsReview(best));
        if (type.manual) expect(best.score).toBe(0);

        const blank = type.grade(frozen, null, { points: POINTS });
        expect(blank.score).toBe(0);
        expect(blank.lines.every((l) => l.verdict === "unanswered")).toBe(true);

        const wrong = type.wrongResponse?.(frozen) ?? null;
        if (wrong !== null) {
          type.responseSchema.parse(wrong);
          const w = type.grade(frozen, wrong, { points: POINTS });
          // Nothing earned; below zero only through the question's own penalties.
          expect(w.score).toBeLessThanOrEqual(0);
          expect(w.score).toBeGreaterThanOrEqual(-POINTS);
          expect(w.lines.some((l) => l.verdict === "correct" || l.verdict === "partial")).toBe(false);
          expect(sumPoints(w.lines)).toBe(w.score);
        }

        const random = type.randomResponse(frozen, createRng(`${seed}:answer`));
        type.responseSchema.parse(random);
        const r = type.grade(frozen, random, { points: POINTS });
        expect(r.score).toBeLessThanOrEqual(POINTS);
        expect(r.score).toBeGreaterThanOrEqual(-POINTS);
        expect(sumPoints(r.lines)).toBe(r.score);
      }
      // Generous: the spreadsheet type evaluates a HyperFormula sheet per grade, which
      // takes several seconds over 1,000 seeds when the suite runs in parallel.
    }, 60_000);

    it.runIf(type.review !== undefined)("marks by hand: every criterion ticked on the key is full marks", () => {
      for (let s = 0; s < 50; s++) {
        const { instance } = type.generate(def, createRng(`review:${s}`));
        const POINTS = POINT_VALUES[s % POINT_VALUES.length];
        const criteria = type.review!.criteria(instance, POINTS);
        if (criteria.length === 0) continue; // e.g. a passage with no hand-marked part
        const all = type.review!.mark(instance, type.keyResponse(instance), criteria.map((c) => c.id), { points: POINTS });
        expect(all.score).toBe(POINTS);
        expect(all.needsReview).toBe(false);
        expect(sumPoints(all.lines)).toBe(all.score);
        const none = type.review!.mark(instance, type.keyResponse(instance), [], { points: POINTS });
        expect(none.score).toBeLessThan(POINTS);
        expect(sumPoints(none.lines)).toBe(none.score);
      }
    });

    it.runIf(type.analysisTokens !== undefined)("analysis tokens come from its universe, and the key's tokens are the keyed ones", () => {
      for (let s = 0; s < 50; s++) {
        const { instance } = type.generate(def, createRng(`tokens:${s}`));
        const u = type.tokenUniverse!(instance);
        const ids = new Set(u.tokens.map((t) => t.id));
        const keyed = type.analysisTokens!(instance, type.keyResponse(instance));
        expect(keyed.every((t) => ids.has(t))).toBe(true);
        expect(u.key.every((k) => ids.has(k))).toBe(true);
        expect([...keyed].sort()).toEqual([...u.key].sort());
        const random = type.analysisTokens!(instance, type.randomResponse(instance, createRng(`tokens:${s}:r`)));
        expect(random.every((t) => ids.has(t))).toBe(true);
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
