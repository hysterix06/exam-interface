import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { gradeChoice, type MultiScoring } from "./choice";
import { fmtNum, orList, roundScore, sumPoints } from "./format";
import { describeTolerance, parseNumberWithUnit, withinTolerance } from "./numeric";
import { DEFAULT_TEXT_OPTS, matchAccepted, matchRegex, normalizeText } from "./text";

describe("format", () => {
  it("removes float noise", () => {
    expect(roundScore(0.1 + 0.2)).toBe(0.3);
    expect(fmtNum(0.1 + 0.2)).toBe("0.3");
    expect(fmtNum(-0)).toBe("0");
    expect(orList(["a", "b", "c"])).toBe("a, b or c");
  });
});

describe("text matching", () => {
  it("normalizes case and whitespace by default", () => {
    expect(normalizeText("  Hello   World ", DEFAULT_TEXT_OPTS)).toBe("hello world");
    expect(matchAccepted(" paris ", ["Paris"], DEFAULT_TEXT_OPTS)).toBe("Paris");
    expect(matchAccepted("Pariss", ["Paris"], DEFAULT_TEXT_OPTS)).toBeNull();
  });

  it("honors case sensitivity", () => {
    const opts = { caseSensitive: true, collapseWhitespace: true };
    expect(matchAccepted("paris", ["Paris"], opts)).toBeNull();
    expect(matchAccepted("Paris", ["Paris"], opts)).toBe("Paris");
  });

  it("matches regexes against the whole answer", () => {
    expect(matchRegex("colour", "colou?r", false)).toBe(true);
    expect(matchRegex("my colour", "colou?r", false)).toBe(false);
    expect(matchRegex("COLOR", "colou?r", true)).toBe(false);
    expect(matchRegex("x", "(", false)).toBe(false);
    expect(matchRegex("a".repeat(501), "a+", false)).toBe(false);
  });
});

describe("numeric parsing and tolerance", () => {
  it.each([
    ["4.05", 4.05, ""],
    ["-1.2e3", -1200, ""],
    ["−3", -3, ""],
    [".5", 0.5, ""],
    ["1,250 kg", 1250, "kg"],
    ["9.81 m/s^2", 9.81, "m/s^2"],
    ["1,250,000.5", 1250000.5, ""],
  ])("parses %s", (input, value, unit) => {
    expect(parseNumberWithUnit(input)).toEqual({ value, unit });
  });

  it.each(["", "abc", "1,5", "--2", "e5"])("rejects %j", (input) => {
    expect(parseNumberWithUnit(input)).toBeNull();
  });

  it("applies absolute, relative and exact tolerance", () => {
    expect(withinTolerance(4, 4.05, { abs: 0.1 })).toBe(true);
    expect(withinTolerance(4, 4.2, { abs: 0.1 })).toBe(false);
    expect(withinTolerance(200, 201, { rel: 0.01 })).toBe(true);
    expect(withinTolerance(200, 203, { rel: 0.01 })).toBe(false);
    expect(withinTolerance(0.3, 0.1 + 0.2, {})).toBe(true);
    expect(withinTolerance(1, 1.001, {})).toBe(false);
    // whichever is larger wins
    expect(withinTolerance(10, 10.5, { abs: 0.5, rel: 0.01 })).toBe(true);
  });

  it("describes tolerance in plain language", () => {
    expect(describeTolerance({})).toBe("exactly");
    expect(describeTolerance({ abs: 0.1 })).toBe("within ±0.1");
    expect(describeTolerance({ rel: 0.05 })).toBe("within ±5%");
    expect(describeTolerance({ abs: 1, rel: 0.02 })).toBe(
      "within ±1 or ±2%, whichever is larger",
    );
  });
});

const OPTIONS = ["a", "b", "c", "d"].map((id) => ({ id, text: id.toUpperCase() }));

describe("gradeChoice: single", () => {
  const base = { options: OPTIONS, key: ["b"], points: 2, multiple: false };

  it("scores correct, wrong and unanswered", () => {
    expect(gradeChoice({ ...base, selected: ["b"] }).score).toBe(2);
    expect(gradeChoice({ ...base, selected: ["a"] }).score).toBe(0);
    const blank = gradeChoice({ ...base, selected: null });
    expect(blank.score).toBe(0);
    expect(blank.lines[0].verdict).toBe("unanswered");
  });

  it("applies negative marking only to wrong answers", () => {
    expect(gradeChoice({ ...base, penalty: 0.25, selected: ["a"] }).score).toBe(-0.5);
    expect(gradeChoice({ ...base, penalty: 0.25, selected: [] }).score).toBe(0);
    expect(gradeChoice({ ...base, penalty: 0.25, selected: ["b"] }).score).toBe(2);
  });

  it("ignores ids that are not options", () => {
    expect(gradeChoice({ ...base, selected: ["zzz"] }).lines[0].verdict).toBe("unanswered");
  });
});

describe("gradeChoice: multiple", () => {
  const base = { options: OPTIONS, key: ["a", "c"], points: 4, multiple: true };
  const score = (scoring: MultiScoring, selected: string[]) =>
    gradeChoice({ ...base, scoring, selected }).score;

  it.each<[MultiScoring, string[], number]>([
    ["all-or-nothing", ["a", "c"], 4],
    ["all-or-nothing", ["c", "a"], 4],
    ["all-or-nothing", ["a"], 0],
    ["all-or-nothing", ["a", "c", "d"], 0],
    ["right-minus-wrong", ["a", "c"], 4],
    ["right-minus-wrong", ["a"], 2],
    ["right-minus-wrong", ["a", "b"], 0],
    ["right-minus-wrong", ["b", "d"], 0], // -4 floored at 0
    ["right-minus-wrong", ["a", "b", "c"], 2],
    ["per-option", ["a", "c"], 4],
    ["per-option", ["a"], 3],
    ["per-option", ["b", "d"], 0],
    ["per-option", ["a", "b", "c", "d"], 2],
  ])("%s with %j scores %d", (scoring, selected, expected) => {
    expect(score(scoring, selected)).toBe(expected);
  });

  it("explains the zero floor as its own line", () => {
    const r = gradeChoice({ ...base, scoring: "right-minus-wrong", selected: ["b", "d"] });
    expect(r.lines.at(-1)?.label).toBe("Minimum score");
    expect(sumPoints(r.lines)).toBe(r.score);
  });

  it("keeps the score in range and equal to the sum of its lines", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<MultiScoring>("all-or-nothing", "right-minus-wrong", "per-option"),
        fc.subarray(["a", "b", "c", "d"]),
        fc.subarray(["a", "b", "c", "d"], { minLength: 1 }),
        fc.integer({ min: 1, max: 10 }),
        (scoring, selected, key, points) => {
          const r = gradeChoice({ options: OPTIONS, key, points, multiple: true, scoring, selected });
          expect(r.score).toBeGreaterThanOrEqual(0);
          expect(r.score).toBeLessThanOrEqual(points);
          expect(sumPoints(r.lines)).toBe(r.score);
        },
      ),
    );
  });
});
