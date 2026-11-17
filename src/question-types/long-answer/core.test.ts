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

describe("long-answer review hook", () => {
  it("marks exactly like gradeRubric and lists aids", async () => {
    const { gradeRubric } = await import("./core");
    const inst = longAnswer.generate(longAnswer.defSchema.parse({ stem: "Explain", rubric: [{ id: "a", text: "A", points: 1 }, { id: "b", text: "B", points: 3 }], keywords: ["cell"], maxWords: 100 }), createRng("x")).instance;
    expect(longAnswer.review!.mark(inst, { text: "x" }, ["b", "zz"], { points: 2 })).toEqual(gradeRubric(inst, ["b"], 2));
    expect(longAnswer.review!.criteria(inst, 2).map((c) => c.points)).toEqual([0.5, 1.5]);
    expect(longAnswer.review!.aids!(inst, { text: "the cell divides" }).notes).toEqual(["3 words (limit 100)", "Keywords found: cell"]);
  });
});
