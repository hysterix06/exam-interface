import { describe, expect, it } from "vitest";
import { expectedKeyScore, keyNeedsReview } from "@/engine/grading/expect";
import { getQuestionType } from "@/question-types/registry";
import { fixturesByType } from "@/question-types/fixtures";
import { type AttemptPoolItem, buildAttempt } from "./attempt";
import type { Blueprint } from "./selection/types";

// One pool entry per fixture, spread over two topics.
const POOL: AttemptPoolItem[] = Object.entries(fixturesByType).flatMap(([type, defs]) =>
  defs.map((def, i) => ({
    id: `${type}-${i}`,
    versionId: `${type}-${i}-v1`,
    topicId: i % 2 === 0 ? "even" : "odd",
    type,
    def,
    weight: 1,
    difficulty: 2,
    points: 2,
  })),
);

const BLUEPRINT: Blueprint = {
  sections: [
    { topicId: "even", count: 4 },
    { topicId: "odd", count: 2 },
  ],
  shuffleQuestions: true,
};

describe("buildAttempt", () => {
  it("reproduces exactly from the seed", () => {
    const a = buildAttempt("attempt-1", BLUEPRINT, POOL);
    expect(buildAttempt("attempt-1", BLUEPRINT, POOL)).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it("gives different students different exams", () => {
    const exams = new Set(
      Array.from({ length: 30 }, (_, s) =>
        JSON.stringify(buildAttempt(`student-${s}`, BLUEPRINT, POOL).items.map((i) => i.instance)),
      ),
    );
    expect(exams.size).toBeGreaterThan(25);
  });

  it("numbers items in order and keeps each question's version and points", () => {
    const { items } = buildAttempt("attempt-2", BLUEPRINT, POOL);
    expect(items.map((i) => i.position)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const item of items) {
      expect(item.versionId).toBe(`${item.questionId}-v1`);
      expect(item.points).toBe(2);
    }
  });

  it("gives a perfect student every machine-marked point on every seed", () => {
    for (let s = 0; s < 200; s++) {
      const { items } = buildAttempt(`perfect-${s}`, BLUEPRINT, POOL);
      for (const item of items) {
        const type = getQuestionType(item.type);
        const r = type.grade(item.instance, type.keyResponse(item.instance), { points: item.points });
        expect(r.score).toBe(expectedKeyScore(r, item.points));
        if (!keyNeedsReview(r)) expect(r.score).toBe(item.points);
      }
    }
  });

  it("does not depend on the question's position in the pool", () => {
    const a = buildAttempt("pos", BLUEPRINT, POOL);
    const b = buildAttempt("pos", BLUEPRINT, POOL.slice().reverse());
    expect(b).toEqual(a);
  });
});
