import { describe, expect, it } from "vitest";
import { topicMastery } from "./mastery";

const item = (topicId: string | null, topicName: string | null, score: number, max: number, needsReview = false) => ({ topicId, topicName, score, max, needsReview });

describe("topicMastery", () => {
  it("sums points per topic, in order of first appearance, with a plain-language line", () => {
    const m = topicMastery([item("g", "Genetics", 2, 2), item("c", "Cells", 0, 1), item("g", "Genetics", 2, 4)]);
    expect(m.topics).toEqual([
      { topicId: "g", name: "Genetics", score: 4, max: 6, percent: 67, questions: 2, pending: 0, line: "Genetics: 4 of 6 points (67%) across 2 questions." },
      { topicId: "c", name: "Cells", score: 0, max: 1, percent: 0, questions: 1, pending: 0, line: "Cells: 0 of 1 point (0%) across 1 question." },
    ]);
    expect(m.weakest).toBe("c");
  });

  it("leaves answers awaiting marking out of the score but counts them", () => {
    const m = topicMastery([item("e", "Ecology", 1, 1), item("e", "Ecology", 0, 5, true)]);
    expect(m.topics[0]).toMatchObject({ score: 1, max: 1, percent: 100, questions: 2, pending: 1 });
    expect(m.topics[0].line).toBe("Ecology: 1 of 1 point (100%) across 1 question; 1 more still to be marked.");
    expect(m.pending).toBe(1);
  });

  it("handles a topic with only pending answers and questions with no topic", () => {
    const m = topicMastery([item("e", "Ecology", 0, 5, true), item(null, null, 1, 2)]);
    expect(m.topics[0]).toMatchObject({ topicId: "e", percent: null, line: "Ecology: 1 question still to be marked." });
    expect(m.topics[1]).toMatchObject({ topicId: null, name: "Other", percent: 50 });
    expect(m.weakest).toBe(null);
  });

  it("names no weakest topic when there is only one, or all are tied", () => {
    expect(topicMastery([item("a", "A", 1, 2)]).weakest).toBe(null);
    expect(topicMastery([item("a", "A", 1, 2), item("b", "B", 2, 4)]).weakest).toBe(null);
    expect(topicMastery([]).topics).toEqual([]);
  });

  it("rounds fractional scores for display", () => {
    const m = topicMastery([item("a", "A", 0.1 + 0.2, 1)]);
    expect(m.topics[0].score).toBe(0.3);
    expect(m.topics[0].line).toBe("A: 0.3 of 1 point (30%) across 1 question.");
  });
});
