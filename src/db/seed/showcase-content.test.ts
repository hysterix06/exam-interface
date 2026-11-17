import { describe, expect, it } from "vitest";
import { expectedKeyScore } from "@/engine/grading/expect";
import { createRng } from "@/engine/rng";
import { getQuestionType } from "@/question-types/registry";
import { SHOWCASE_QUESTIONS } from "./showcase-content";

// The seed would happily insert a broken question; catch it here instead.
describe("showcase seed content", () => {
  it("covers every question type the main bank doesn't", () => {
    expect(new Set(SHOWCASE_QUESTIONS.map((q) => q.type))).toEqual(
      new Set(["ordering", "matching", "cloze", "numeric", "table-fill", "spreadsheet", "widget", "long-answer"]),
    );
  });

  it.each(SHOWCASE_QUESTIONS.map((q) => [q.type, q] as const))("%s passes pre-flight and its key scores full marks", (_t, q) => {
    const type = getQuestionType(q.type);
    const def = type.defSchema.parse(q.def);
    expect(type.validateDef(def).filter((i) => i.severity === "blocking")).toEqual([]);
    for (const seed of ["a", "b", "c"]) {
      const { instance } = type.generate(def, createRng(seed));
      const r = type.grade(instance, type.keyResponse(instance), { points: q.points });
      expect(r.score).toBe(expectedKeyScore(r, q.points));
    }
  });
});
