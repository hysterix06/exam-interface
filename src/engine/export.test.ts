import { describe, expect, it } from "vitest";
import { ITEM_HEADER, SUMMARY_HEADER, extraTimeText, itemRows, summaryRows } from "./export";

const started = new Date("2026-11-01T09:00:00Z");
const submitted = new Date("2026-11-01T09:20:00Z");

describe("summaryRows", () => {
  it("keeps the original eight columns first, then the audit columns", () => {
    expect(SUMMARY_HEADER.slice(0, 8)).toEqual(["Student", "Email", "Status", "Score", "Out of", "Percent", "Started", "Submitted"]);
    expect(SUMMARY_HEADER.slice(8)).toEqual(["Extra time", "Tab switches", "Pastes", "Attempt ID", "Seed", "Minutes late", "Late penalty (points)"]);
  });

  it("writes one row per attempt with percent, extensions and signals", () => {
    const [row] = summaryRows([
      {
        attemptId: "a1",
        name: "Sam",
        email: "s@x",
        state: "graded",
        score: 7,
        maxScore: 8,
        startedAt: started,
        submittedAt: submitted,
        seed: "seed-1",
        extensions: [{ kind: "minutes", value: 10 }, { kind: "multiplier", value: 1.25 }],
        blurs: 2,
        pastes: 0,
        latePenalty: { minutes: 3, points: 0.42 },
      },
    ]);
    expect(row).toEqual(["Sam", "s@x", "graded", 7, 8, 87.5, started.toISOString(), submitted.toISOString(), "+10 min; ×1.25 time", 2, 0, "a1", "seed-1", 3, 0.42]);
    expect(row).toHaveLength(SUMMARY_HEADER.length);
  });

  it("leaves blanks for an attempt still in progress", () => {
    const [row] = summaryRows([
      { attemptId: "a", name: null, email: "e", state: "in_progress", score: null, maxScore: null, startedAt: started, submittedAt: null, seed: "s", extensions: [], blurs: 0, pastes: 0 },
    ]);
    expect(row.slice(0, 8)).toEqual(["", "e", "in_progress", null, null, null, started.toISOString(), ""]);
    expect(row[8]).toBe("");
  });
});

describe("extraTimeText", () => {
  it("describes minutes (with sign) and multipliers", () => {
    expect(extraTimeText([])).toBe("");
    expect(extraTimeText([{ kind: "minutes", value: -5 }])).toBe("-5 min");
    expect(extraTimeText([{ kind: "multiplier", value: 1.5 }])).toBe("×1.5 time");
  });
});

describe("itemRows", () => {
  it("writes one row per answer in long format", () => {
    const rows = itemRows([
      { attemptId: "a1", name: "Sam", email: "s@x", position: 0, question: "What is 2+2?", topic: "Arithmetic", version: 3, score: 1, max: 1, gradedBy: "auto", needsReview: false, overrideReason: null },
      { attemptId: "a1", name: "Sam", email: "s@x", position: 1, question: "Explain", topic: null, version: 1, score: null, max: null, gradedBy: null, needsReview: true, overrideReason: "late fix" },
    ]);
    expect(ITEM_HEADER).toEqual(["Student", "Email", "Attempt ID", "Question #", "Question", "Topic", "Version", "Score", "Out of", "Graded by", "Needs marking", "Score changed by hand"]);
    expect(rows[0]).toEqual(["Sam", "s@x", "a1", 1, "What is 2+2?", "Arithmetic", 3, 1, 1, "auto", "no", ""]);
    expect(rows[1]).toEqual(["Sam", "s@x", "a1", 2, "Explain", "", 1, null, null, "", "yes", "late fix"]);
  });
});
