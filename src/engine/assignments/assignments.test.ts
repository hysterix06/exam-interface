import { describe, expect, it } from "vitest";
import { sumPoints } from "../grading/format";
import { gradeSubmission } from "./grade";
import { dueLatePenalty, hardCloseAt, describeDueLatePolicy } from "./late";
import { validateAssignment } from "./preflight";
import { parseAssignmentSettings } from "./settings";
import { assignmentState, canSubmit } from "./state";

const at = (s: string) => new Date(`2026-03-${s}Z`);
const accept = { mode: "accept" as const, penaltyPercentPerDay: 10, maxPenaltyPercent: 50, closesAfterDays: 7 };

describe("assignment settings", () => {
  it("fills defaults and survives junk", () => {
    const s = parseAssignmentSettings({});
    expect(s).toMatchObject({ allowText: true, allowFiles: true, maxFiles: 3, resubmit: true, late: { mode: "reject" } });
    expect(parseAssignmentSettings("nope")).toEqual(s);
    expect(parseAssignmentSettings({ maxFiles: 99 })).toEqual(s);
  });
});

describe("late policy", () => {
  it("charges per started day, capped", () => {
    expect(dueLatePenalty({ mode: "reject" }, 90, 8)).toBeNull();
    expect(dueLatePenalty(accept, 0, 8)).toBeNull();
    const one = dueLatePenalty(accept, 90, 8)!;
    expect(one).toMatchObject({ minutes: 90, percent: 10, points: 0.8 });
    expect(one.explanation).toMatch(/1 day late/);
    const capped = dueLatePenalty(accept, 60 * 24 * 6 + 1, 10)!;
    expect(capped.percent).toBe(50);
    expect(capped.explanation).toMatch(/capped at 50%/);
  });
  it("closes the door after the late window", () => {
    const due = at("10T12:00:00");
    expect(hardCloseAt(due, { mode: "reject" })).toEqual(due);
    expect(hardCloseAt(due, accept)).toEqual(at("17T12:00:00"));
    expect(hardCloseAt(null, accept)).toBeNull();
  });
  it("says the policy in words", () => {
    expect(describeDueLatePolicy({ mode: "reject" })).toMatch(/not accepted/);
    expect(describeDueLatePolicy(accept)).toMatch(/up to 7 days.*10% per day.*50%/);
  });
});

describe("assignmentState", () => {
  const a = (o: Partial<Parameters<typeof assignmentState>[0]> = {}) => ({
    state: "published" as const,
    opensAt: at("01T09:00:00"),
    dueAt: at("10T12:00:00"),
    late: accept,
    ...o,
  });
  it("walks draft → scheduled → open → late → closed", () => {
    expect(assignmentState(a({ state: "draft" }), at("05T00:00:00"))).toBe("draft");
    expect(assignmentState(a(), at("01T08:59:59"))).toBe("scheduled");
    expect(assignmentState(a(), at("05T00:00:00"))).toBe("open");
    expect(assignmentState(a(), at("10T12:00:04"))).toBe("open"); // grace
    expect(assignmentState(a(), at("11T00:00:00"))).toBe("late");
    expect(assignmentState(a(), at("17T12:01:00"))).toBe("closed");
    expect(assignmentState(a({ late: { mode: "reject" } }), at("11T00:00:00"))).toBe("closed");
  });
  it("honours a student's own due date and open-ended work", () => {
    expect(assignmentState(a({ late: { mode: "reject" } }), at("11T00:00:00"), at("12T00:00:00"))).toBe("open");
    expect(assignmentState(a({ dueAt: null, opensAt: null }), at("20T00:00:00"))).toBe("open");
    expect(canSubmit("open") && canSubmit("late") && !canSubmit("closed") && !canSubmit("scheduled")).toBe(true);
  });
});

describe("gradeSubmission", () => {
  const rubric = [
    { id: "a", text: "Clear hypothesis", points: 2 },
    { id: "b", text: "Method", points: 3 },
    { id: "c", text: "Discussion", points: 5 },
  ];
  it("scales rubric weights to the assignment's points", () => {
    const g = gradeSubmission({ rubric, points: 20, ticked: ["a", "c"], lateMinutes: 0, late: accept });
    expect(g.score).toBe(14);
    expect(g.max).toBe(20);
    expect(g.latePenalty).toBeNull();
    expect(sumPoints(g.lines)).toBe(g.score);
  });
  it("takes the late penalty off what was earned, as its own line", () => {
    const g = gradeSubmission({ rubric, points: 10, ticked: ["a", "b", "c"], lateMinutes: 60 * 30, late: accept });
    expect(g.latePenalty?.percent).toBe(20);
    expect(g.score).toBe(8);
    expect(g.lines.at(-1)).toMatchObject({ label: "Late penalty", points: -2 });
    expect(sumPoints(g.lines)).toBe(g.score);
  });
  it("marks without a rubric from a single score, clamped", () => {
    const g = gradeSubmission({ rubric: [], points: 10, score: 7.5, lateMinutes: 0, late: accept });
    expect(g.score).toBe(7.5);
    expect(g.lines).toHaveLength(1);
    expect(gradeSubmission({ rubric: [], points: 10, score: 40, lateMinutes: 0, late: accept }).score).toBe(10);
    expect(gradeSubmission({ rubric: [], points: 10, lateMinutes: 0, late: accept }).score).toBe(0);
  });
  it("ignores ticks that aren't criteria", () => {
    expect(gradeSubmission({ rubric, points: 10, ticked: ["zzz"], lateMinutes: 0, late: accept }).score).toBe(0);
  });
});

describe("validateAssignment", () => {
  const ok: Parameters<typeof validateAssignment>[0] = {
    title: "Lab 1",
    points: 10,
    opensAt: at("01T00:00:00"),
    dueAt: at("10T00:00:00"),
    categoryId: "c1",
    categoryIds: ["c1"],
    rubric: [{ id: "a", text: "Thing", points: 1 }],
    settings: parseAssignmentSettings({}),
  };
  const codes = (o: Partial<typeof ok>) => validateAssignment({ ...ok, ...o }).map((i) => `${i.severity}:${i.code}`);
  it("passes a complete assignment", () => {
    expect(validateAssignment(ok)).toEqual([]);
  });
  it("blocks what would break and warns about what's odd", () => {
    expect(codes({ title: " " })).toContain("blocking:assignment.no-title");
    expect(codes({ points: 0 })).toContain("blocking:assignment.no-points");
    expect(codes({ dueAt: at("01T00:00:00") })).toContain("blocking:assignment.due-before-open");
    expect(codes({ settings: { ...ok.settings, allowText: false, allowFiles: false } })).toContain("blocking:assignment.no-way-to-submit");
    expect(codes({ rubric: [{ id: "a", text: "x", points: 1 }, { id: "a", text: "y", points: 1 }] })).toContain("blocking:assignment.rubric-duplicate");
    expect(codes({ rubric: [{ id: "a", text: "", points: 1 }] })).toContain("blocking:assignment.rubric-empty-text");
    expect(codes({ rubric: [{ id: "a", text: "x", points: 0 }] })).toContain("blocking:assignment.rubric-no-points");
    expect(codes({ dueAt: null })).toContain("warning:assignment.no-due-date");
    expect(codes({ categoryId: null })).toContain("warning:assignment.no-category");
    expect(codes({ categoryId: "gone" })).toContain("blocking:assignment.unknown-category");
    expect(codes({ rubric: [] })).toContain("warning:assignment.no-rubric");
  });
});
