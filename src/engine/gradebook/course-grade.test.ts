import { describe, expect, it } from "vitest";
import { courseGrade, type GradebookItem } from "./course-grade";

const cat = (id: string, weight: number, dropLowest = 0) => ({ id, name: id[0].toUpperCase() + id.slice(1), weight, dropLowest });
const item = (id: string, categoryId: string | null, score: number | null, max = 10, extra: Partial<GradebookItem> = {}): GradebookItem => ({
  id,
  title: id,
  kind: "assignment",
  categoryId,
  score,
  max,
  ...extra,
});

describe("courseGrade", () => {
  it("weights each category's points-percentage", () => {
    const g = courseGrade([cat("exams", 60), cat("homework", 40)], [
      item("e1", "exams", 80, 100),
      item("h1", "homework", 9),
      item("h2", "homework", 7),
    ]);
    // exams 80%, homework 16/20 = 80% → 80%
    expect(g.percent).toBe(80);
    expect(g.categories.map((c) => c.percent)).toEqual([80, 80]);
    expect(g.lines.at(-1)).toMatch(/Course grade: 80%/);
  });

  it("scales the weights when a category has nothing graded yet", () => {
    const g = courseGrade([cat("exams", 50), cat("quizzes", 20), cat("homework", 30)], [
      item("e1", "exams", 90, 100),
      item("q1", "quizzes", 5, 10),
      item("h1", "homework", null),
    ]);
    // (90 × 50 + 50 × 20) / 70 = 78.5714…
    expect(g.percent).toBeCloseTo(78.5714, 3);
    const hw = g.categories.find((c) => c.id === "homework")!;
    expect(hw.percent).toBeNull();
    expect(hw.effectiveWeight).toBe(0);
    expect(hw.pending).toBe(1);
    expect(g.lines.join("\n")).toMatch(/Homework .*nothing graded yet/);
    expect(g.lines.join("\n")).toMatch(/scaled/);
  });

  it("drops the lowest items, but always keeps one", () => {
    const g = courseGrade([cat("quizzes", 100, 2)], [item("q1", "quizzes", 2), item("q2", "quizzes", 9), item("q3", "quizzes", 6)]);
    expect(g.categories[0].dropped).toEqual(["q1", "q3"]);
    expect(g.percent).toBe(90);
    const solo = courseGrade([cat("quizzes", 100, 3)], [item("q1", "quizzes", 2)]);
    expect(solo.categories[0].dropped).toEqual([]);
    expect(solo.percent).toBe(20);
  });

  it("drops by percentage, not raw points", () => {
    const g = courseGrade([cat("quizzes", 100, 1)], [item("big", "quizzes", 40, 100), item("small", "quizzes", 3, 10)]);
    expect(g.categories[0].dropped).toEqual(["small"]);
  });

  it("leaves excused and uncategorised work out", () => {
    const g = courseGrade([cat("homework", 100)], [
      item("h1", "homework", 0, 10, { excused: true }),
      item("h2", "homework", 10),
      item("x", null, 0),
    ]);
    expect(g.percent).toBe(100);
    expect(g.uncounted).toEqual(["x"]);
    expect(g.categories[0].excused).toBe(1);
    expect(g.lines.join("\n")).toMatch(/excused/);
  });

  it("is null when nothing is graded", () => {
    const g = courseGrade([cat("exams", 100)], [item("e1", "exams", null)]);
    expect(g.percent).toBeNull();
    expect(g.lines.at(-1)).toMatch(/No course grade yet/);
  });

  it("counts by points when no categories are set up", () => {
    const g = courseGrade([], [item("a", null, 5), item("b", null, 15, 30), item("c", null, null)]);
    expect(g.percent).toBe(50);
    expect(g.uncounted).toEqual([]);
    expect(g.lines[0]).toMatch(/No weights/);
  });

  it("ignores zero-point items and zero-weight categories", () => {
    const g = courseGrade([cat("exams", 100), cat("bonus", 0)], [item("e", "exams", 7), item("z", "exams", 0, 0), item("b", "bonus", 10)]);
    expect(g.percent).toBe(70);
  });

  it("rounds only what it shows", () => {
    const g = courseGrade([cat("a", 1), cat("b", 2)], [item("x", "a", 1, 3), item("y", "b", 2, 3)]);
    expect(g.percent).toBeCloseTo(55.5556, 3);
    expect(g.lines.at(-1)).toMatch(/55\.6%/);
  });
});
