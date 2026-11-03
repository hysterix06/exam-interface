import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";
import { effectiveState } from "./exam-state";
import { canonical, compareReproduction, regradeItems } from "./regrade";
import { createRng, questionSeed } from "./rng";
import { getQuestionType } from "@/question-types/registry";
import { fixturesByType } from "@/question-types/fixtures";

describe("effectiveState", () => {
  const at = (s: string) => new Date(`2026-03-01T${s}Z`);
  const win = (state: Parameters<typeof effectiveState>[0]["state"], o: string | null, c: string | null) => ({
    state,
    opensAt: o ? at(o) : null,
    closesAt: c ? at(c) : null,
  });

  it("opens a scheduled exam by itself at its start time", () => {
    expect(effectiveState(win("scheduled", "09:00:00", null), at("08:59:59"))).toBe("scheduled");
    expect(effectiveState(win("scheduled", "09:00:00", null), at("09:00:00"))).toBe("open");
  });
  it("closes at the end time, whether it opened by schedule or by hand", () => {
    expect(effectiveState(win("scheduled", "09:00:00", "10:00:00"), at("10:00:01"))).toBe("closed");
    expect(effectiveState(win("open", null, "10:00:00"), at("09:59:59"))).toBe("open");
    expect(effectiveState(win("open", null, "10:00:00"), at("10:00:01"))).toBe("closed");
  });
  it("leaves other states and unscheduled exams alone", () => {
    expect(effectiveState(win("draft", "09:00:00", "10:00:00"), at("09:30:00"))).toBe("draft");
    expect(effectiveState(win("scheduled", null, null), at("12:00:00"))).toBe("scheduled");
    expect(effectiveState(win("released", null, "10:00:00"), at("11:00:00"))).toBe("released");
  });
});

describe("csv", () => {
  it("quotes only when needed", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(3.5)).toBe("3.5");
    expect(csvCell(false)).toBe("false");
  });
  it("defuses spreadsheet formulas in text but not in numbers", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell(-2)).toBe("-2");
  });
  it("joins rows with CRLF", () => {
    expect(toCsv([["a", "b"], [1, null]])).toBe("a,b\r\n1,\r\n");
  });
});

describe("regradeItems", () => {
  const type = getQuestionType("mcq");
  const oldDef = type.defSchema.parse(fixturesByType["mcq"][0]); // "b" is correct
  const seed = "attempt-seed";
  const versionId = "v-old";
  const oldInstance = type.generate(oldDef, createRng(questionSeed(seed, versionId))).instance;
  const base = { attemptId: "a1", attemptSeed: seed, oldVersionId: versionId, type: "mcq", points: 1 };

  it("shows who gains and loses when the key changes, keeping each student's own option order", () => {
    // The author realises "a" (Nucleus) was the intended answer instead.
    const newDef = { ...oldDef, options: oldDef.options.map((o: { id: string }) => ({ ...o, correct: o.id === "a" })) };
    const diffs = regradeItems([
      { ...base, itemId: "i1", newDef, response: { selected: ["b"] }, oldScore: 1 },
      { ...base, itemId: "i2", attemptId: "a2", newDef, response: { selected: ["a"] }, oldScore: -0.25 },
      { ...base, itemId: "i3", attemptId: "a3", newDef, response: null, oldScore: 0 },
    ]);
    expect(diffs.map((d) => [d.oldScore, d.newScore, d.delta])).toEqual([
      [1, -0.25, -1.25],
      [-0.25, 1, 1.25],
      [0, 0, 0],
    ]);
    // Same seed, same order: the student sees the options as before.
    expect((diffs[0].instance as typeof oldInstance).options).toEqual(oldInstance.options);
  });

  it("is a no-op when nothing changed", () => {
    const [d] = regradeItems([{ ...base, itemId: "i", newDef: oldDef, response: { selected: oldInstance.key }, oldScore: 1 }]);
    expect(d.delta).toBe(0);
    expect(d.lines.length).toBeGreaterThan(0);
  });

  it("treats a malformed saved answer as unanswered", () => {
    expect(regradeItems([{ ...base, itemId: "i", newDef: oldDef, response: { junk: 1 }, oldScore: 0 }])[0].newScore).toBe(0);
  });
});

describe("canonical", () => {
  it("ignores key order at every depth but not array order or values", () => {
    expect(canonical({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: null } })).toBe(canonical({ a: { c: null, d: [1, { x: 2, y: 1 }] }, b: 1 }));
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
    expect(canonical(undefined)).toBe("null");
  });
  it("treats a re-keyed copy as identical", () => {
    const r = compareReproduction({
      stored: [{ position: 0, questionVersionId: "v", instance: { z: 1, a: [{ q: 1, b: 2 }] } }],
      rebuilt: [{ position: 0, versionId: "v", instance: { a: [{ b: 2, q: 1 }], z: 1 } }],
    });
    expect(r.identical).toBe(true);
  });
});

describe("compareReproduction", () => {
  const stored = [{ position: 0, questionVersionId: "v1", instance: { a: 1 } }, { position: 1, questionVersionId: "v2", instance: { b: 2 } }];
  it("confirms an identical rebuild", () => {
    const r = compareReproduction({ stored, rebuilt: [{ position: 0, versionId: "v1", instance: { a: 1 } }, { position: 1, versionId: "v2", instance: { b: 2 } }] });
    expect(r).toEqual({ identical: true, differences: [] });
  });
  it("names exactly what differs", () => {
    const r = compareReproduction({ stored, rebuilt: [{ position: 0, versionId: "vX", instance: { a: 1 } }, { position: 1, versionId: "v2", instance: { b: 9 } }] });
    expect(r.identical).toBe(false);
    expect(r.differences[0]).toMatch(/Position 1: a different question/);
    expect(r.differences[1]).toMatch(/Position 2: same question, but the generated content differs/);
  });
  it("notices a length mismatch", () => {
    expect(compareReproduction({ stored, rebuilt: [] }).differences[0]).toMatch(/has 2 questions but rebuilding gives 0/);
  });
});
