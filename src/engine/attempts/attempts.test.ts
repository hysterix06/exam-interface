import { describe, expect, it } from "vitest";
import { createRng } from "../rng";
import { getQuestionType } from "@/question-types/registry";
import { fixturesByType } from "@/question-types/fixtures";
import { computeDeadline, effectiveTime, isExpired, secondsLeft } from "./deadline";
import { finalizeAttempt } from "./finalize";
import { HIDDEN, visibility } from "./release";
import { shouldApply } from "./responses";

describe("effectiveTime", () => {
  it("is null for untimed exams", () => {
    expect(effectiveTime(null, [{ kind: "multiplier", value: 2 }])).toBeNull();
    expect(computeDeadline(new Date(0), null)).toBeNull();
  });

  it("explains the plain limit", () => {
    expect(effectiveTime(30)).toEqual({ minutes: 30, explanation: "30 min" });
  });

  it("uses the largest multiplier, not their product, then adds minutes", () => {
    const t = effectiveTime(40, [
      { kind: "multiplier", value: 1.25 },
      { kind: "multiplier", value: 1.5 },
      { kind: "minutes", value: 10 },
      { kind: "minutes", value: 5 },
    ])!;
    expect(t.minutes).toBe(75);
    expect(t.explanation).toBe("40 min × 1.5 + 15 min = 75 min");
  });

  it("handles negative minutes and multipliers below 1", () => {
    expect(effectiveTime(30, [{ kind: "multiplier", value: 0.5 }])!.minutes).toBe(30);
    expect(effectiveTime(30, [{ kind: "minutes", value: -5 }])!.explanation).toBe("30 min − 5 min = 25 min");
  });

  it("computes the deadline from the start", () => {
    expect(computeDeadline(new Date("2026-01-01T10:00:00Z"), 30)!.toISOString()).toBe("2026-01-01T10:30:00.000Z");
  });
});

describe("expiry", () => {
  const deadline = new Date("2026-01-01T10:00:00Z");
  it("allows a short grace period", () => {
    expect(isExpired(deadline, new Date("2026-01-01T10:00:04Z"))).toBe(false);
    expect(isExpired(deadline, new Date("2026-01-01T10:00:06Z"))).toBe(true);
    expect(isExpired(null, new Date())).toBe(false);
  });
  it("counts seconds left, never below zero", () => {
    expect(secondsLeft(deadline, new Date("2026-01-01T09:59:30Z"))).toBe(30);
    expect(secondsLeft(deadline, new Date("2026-01-01T10:05:00Z"))).toBe(0);
    expect(secondsLeft(null, new Date())).toBeNull();
  });
});

describe("visibility", () => {
  it("shows nothing until the exam is released", () => {
    for (const state of ["draft", "scheduled", "open", "closed", "graded"]) {
      expect(visibility(state, "explanations")).toEqual(HIDDEN);
    }
  });
  it("is cumulative by release level", () => {
    expect(visibility("released", "score")).toEqual({ score: true, answers: false, feedback: false, explanations: false });
    expect(visibility("released", "answers").answers).toBe(true);
    expect(visibility("released", "feedback").feedback).toBe(true);
    expect(visibility("released", "feedback").explanations).toBe(false);
    expect(visibility("released", "explanations").explanations).toBe(true);
  });
});

describe("shouldApply", () => {
  it("only accepts newer sequence numbers", () => {
    expect(shouldApply(null, 0)).toBe(true);
    expect(shouldApply(3, 4)).toBe(true);
    expect(shouldApply(3, 3)).toBe(false);
    expect(shouldApply(3, 1)).toBe(false);
  });
});

describe("finalizeAttempt", () => {
  const mcq = getQuestionType("mcq");
  const def = mcq.defSchema.parse(fixturesByType["mcq"][0]);
  const instance = mcq.generate(def, createRng("f")).instance;
  const key = mcq.keyResponse(instance);

  it("totals perfect, blank and penalised answers", () => {
    const wrongId = instance.options.find((o: { id: string }) => !instance.key.includes(o.id)).id;
    const r = finalizeAttempt([
      { id: "a", type: "mcq", instance, response: key, points: 2 },
      { id: "b", type: "mcq", instance, response: null, points: 2 },
      { id: "c", type: "mcq", instance, response: { selected: [wrongId] }, points: 2 },
    ]);
    // This fixture has a 25% wrong-answer penalty: a wrong answer is -0.5.
    expect(r.items.map((i) => i.score)).toEqual([2, 0, -0.5]);
    expect(r.score).toBe(1.5);
    expect(r.max).toBe(6);
    expect(r.needsReview).toBe(false);
    expect(r.items[0].lines.length).toBeGreaterThan(0);
  });

  it("treats a malformed response as unanswered", () => {
    const r = finalizeAttempt([{ id: "a", type: "mcq", instance, response: { nonsense: 1 }, points: 1 }]);
    expect(r.score).toBe(0);
    expect(r.items[0].lines.every((l) => l.verdict === "unanswered")).toBe(true);
  });

  it("is deterministic", () => {
    const input = [{ id: "a", type: "mcq", instance, response: key, points: 1.5 }];
    expect(finalizeAttempt(input)).toEqual(finalizeAttempt(input));
  });
});

import { canTransition, nextStates } from "../exam-state";
import { instanceFeedback, shapeItemResult } from "./results";

describe("exam state machine", () => {
  it("only allows the documented moves", () => {
    expect(canTransition("scheduled", "open")).toBe(true);
    expect(canTransition("open", "closed")).toBe(true);
    expect(canTransition("closed", "released")).toBe(true);
    expect(canTransition("released", "closed")).toBe(true);
    expect(canTransition("draft", "open")).toBe(false);
    expect(canTransition("open", "released")).toBe(false);
    expect(nextStates("draft")).toEqual([]);
  });
});

describe("shapeItemResult", () => {
  const item = {
    score: 1,
    max: 2,
    lines: [{ label: "A", expected: "x", got: "y", verdict: "partial" as const, points: 1, max: 2, note: "because" }],
    feedback: { a: "nice" },
  };
  const v = (answers: boolean, feedback: boolean, explanations: boolean) => ({ score: true, answers, feedback, explanations });

  it("hides per-item detail at score-only", () => {
    expect(shapeItemResult(v(false, false, false), item)).toEqual({});
  });
  it("answers: lines without the grader's notes", () => {
    const r = shapeItemResult(v(true, false, false), item);
    expect(r.score).toBe(1);
    expect(r.lines![0].note).toBeUndefined();
    expect(r.feedback).toBeUndefined();
  });
  it("feedback adds author feedback; explanations add notes", () => {
    expect(shapeItemResult(v(true, true, false), item).feedback).toEqual({ a: "nice" });
    expect(shapeItemResult(v(true, true, true), item).lines![0].note).toBe("because");
    expect(shapeItemResult(v(true, true, true), { ...item, feedback: {} }).feedback).toBeUndefined();
  });
});

describe("instanceFeedback", () => {
  it("reads string feedback only", () => {
    expect(instanceFeedback({ feedback: { a: "x", b: 3 } })).toEqual({ a: "x" });
    expect(instanceFeedback({ feedback: {} })).toBeUndefined();
    expect(instanceFeedback({ feedback: 5 })).toBeUndefined();
    expect(instanceFeedback({})).toBeUndefined();
    expect(instanceFeedback(null)).toBeUndefined();
  });
});
