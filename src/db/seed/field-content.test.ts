import { describe, expect, it } from "vitest";
import { generateQuestion, validateQuestion } from "@/engine/generate";
import { expectedKeyScore } from "@/engine/grading/expect";
import { createRng } from "@/engine/rng";
import { getQuestionType } from "@/question-types/registry";
import { FIELD_QUESTIONS } from "./field-content";

describe("field-skills seed content", () => {
  it.each(FIELD_QUESTIONS.map((q, i) => [`${i} ${q.type}`, q] as const))("%s passes pre-flight and its key scores full marks", (_t, q) => {
    const type = getQuestionType(q.type);
    expect(validateQuestion(type, q.def).filter((i) => i.severity === "blocking")).toEqual([]);
    for (const seed of ["a", "b", "c"]) {
      const { instance } = generateQuestion(type, q.def, createRng(seed));
      const r = type.grade(instance, type.keyResponse(instance), { points: q.points });
      expect(r.score).toBe(expectedKeyScore(r, q.points));
    }
  });
});

describe("demo content as a whole", () => {
  it("has a question of every registered type", async () => {
    const { questionTypes } = await import("@/question-types/registry");
    const { DEMO_QUESTIONS, CHEM_QUESTIONS } = await import("./demo-content");
    const { SHOWCASE_QUESTIONS } = await import("./showcase-content");
    const seeded = new Set([...DEMO_QUESTIONS, ...CHEM_QUESTIONS, ...SHOWCASE_QUESTIONS, ...FIELD_QUESTIONS].map((q) => q.type));
    expect([...questionTypes.keys()].filter((t) => !seeded.has(t))).toEqual([]);
  });
});
