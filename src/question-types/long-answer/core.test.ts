import { describe, expect, it } from "vitest";
import { createRng } from "@/engine/rng";
import { sumPoints } from "@/engine/grading/format";
import { gradeRubric, keywordHits, longAnswer, wordCount } from "./core";
import { longAnswerFixtures } from "./fixtures";

const def = longAnswer.defSchema.parse(longAnswerFixtures[0]);
const { instance } = longAnswer.generate(def, createRng("l"));

describe("long answer", () => {
  it("flags an answer for review without awarding points", () => {
    const r = longAnswer.grade(instance, { text: "Glucose is broken down..." }, { points: 4 });
    expect(r).toMatchObject({ score: 0, needsReview: true, max: 4 });
    expect(r.lines.map((l) => l.verdict)).toEqual(["review", "review", "review"]);
    expect(sumPoints(r.lines.map((l) => ({ points: l.max })))).toBe(4);
  });

  it("does not ask for review when nothing was written", () => {
    const r = longAnswer.grade(instance, { text: "   " }, { points: 4 });
    expect(r.needsReview).toBe(false);
    expect(r.lines.every((l) => l.verdict === "unanswered")).toBe(true);
  });

  it("turns a grader's ticks into weighted points", () => {
    const r = gradeRubric(instance, ["g", "k"], 8);
    // Weights 1, 2, 1 of 4: 2 + 4 + 0.
    expect(r.score).toBe(6);
    expect(r.needsReview).toBe(false);
    expect(r.lines.map((l) => l.got)).toEqual(["met", "met", "not met"]);
    expect(gradeRubric(instance, [], 8).score).toBe(0);
    expect(gradeRubric(instance, ["g", "k", "a"], 8).score).toBe(8);
  });

  it("keeps the rubric away from students", () => {
    expect(longAnswer.redact(instance)).toEqual({ stem: instance.stem, maxWords: 200 });
  });

  it("counts words and finds keywords for the grader's aid", () => {
    expect(wordCount("  two  words ")).toBe(2);
    expect(wordCount("")).toBe(0);
    expect(keywordHits("Glycolysis makes ATP", ["glycolysis", "ATP", "mitochondria", " "])).toEqual({
      found: ["glycolysis", "ATP"],
      missing: ["mitochondria"],
    });
  });

  it("warns that it is hand-marked and blocks an empty rubric", () => {
    expect(longAnswer.validateDef(def).map((i) => i.code)).toEqual(["long-answer.manual"]);
    const bad = longAnswer.defSchema.parse({ stem: "", rubric: [{ id: "a", text: "", points: 0 }, { id: "a", text: "x", points: 1 }] });
    expect(longAnswer.validateDef(bad).map((i) => i.code)).toEqual(
      expect.arrayContaining(["long-answer.empty-stem", "long-answer.empty-criterion", "long-answer.bad-weight", "long-answer.duplicate-id"]),
    );
    expect(longAnswer.validateDef(longAnswer.defSchema.parse({ stem: "x", rubric: [] })).map((i) => i.code)).toContain("long-answer.no-rubric");
  });
});
