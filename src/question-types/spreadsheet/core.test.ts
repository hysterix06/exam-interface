import { describe, expect, it } from "vitest";
import { addr, colIndex, colName, evaluateSheet, formulaFunctions, inGrid, isSheetFunction, parseAddr, sameValue, showValue } from "@/engine/sheet";
import { createRng } from "@/engine/rng";
import { spreadsheet } from "./core";
import { spreadsheetFixtures } from "./fixtures";

describe("sheet helpers", () => {
  it("converts column names both ways", () => {
    expect([0, 1, 25, 26, 27].map(colName)).toEqual(["A", "B", "Z", "AA", "AB"]);
    expect(["A", "Z", "AA", "AB"].map(colIndex)).toEqual([0, 25, 26, 27]);
    expect(addr(2, 1)).toBe("B3");
  });
  it("parses addresses strictly", () => {
    expect(parseAddr("B3")).toEqual({ row: 2, col: 1 });
    for (const bad of ["b3", "3B", "A0", "A", "", "A1:A2"]) expect(parseAddr(bad)).toBeNull();
    expect(inGrid("D5", 5, 4)).toBe(true);
    expect(inGrid("E1", 5, 4)).toBe(false);
    expect(inGrid("A6", 5, 4)).toBe(false);
  });
  it("evaluates formulas and reports errors as text", () => {
    const v = evaluateSheet(3, 3, { A1: "2", A2: "3", A3: "=A1*A2", B1: "=1/0", B2: "=A1+B2", B3: "hello" }).values;
    expect(v.A3).toBe(6);
    expect(v.B1).toBe("#ERROR");
    expect(v.B2).toBe("#ERROR"); // circular
    expect(v.B3).toBe("hello");
    expect(v.C3).toBeUndefined();
  });
  it("ignores cells outside the grid and caches repeat work", () => {
    const raw = { A1: "1", Z99: "5" };
    expect(evaluateSheet(2, 2, raw).values).toEqual({ A1: 1 });
    expect(evaluateSheet(2, 2, { ...raw })).toBe(evaluateSheet(2, 2, raw));
  });
  it("compares numbers with tolerance and text loosely", () => {
    expect(sameValue(10, 10.04, { abs: 0.05 })).toBe(true);
    expect(sameValue(10, 10.2, { abs: 0.05 })).toBe(false);
    expect(sameValue(100, 104, { rel: 0.05 })).toBe(true);
    expect(sameValue("Yes", " yes ", {})).toBe(true);
    expect(sameValue(null, null, {})).toBe(true);
    expect(sameValue(null, 1, {})).toBe(false);
    expect(showValue(null)).toBe("empty");
    expect(showValue(0.1 + 0.2)).toBe("0.3");
  });
});

describe("formula functions", () => {
  it("lists the functions a formula calls, upper-cased, ignoring text in quotes", () => {
    expect(formulaFunctions("=SUM(D2:D3)")).toEqual(["SUM"]);
    expect(formulaFunctions("=round(average(B1:B3), 1) + Sum(A1)")).toEqual(["ROUND", "AVERAGE", "SUM"]);
    expect(formulaFunctions('=IF(A1>0, "SUM(", "x")')).toEqual(["IF"]);
    expect(formulaFunctions("=A1+B1")).toEqual([]);
    expect(formulaFunctions("SUM(A1)")).toEqual([]); // not a formula
    expect(formulaFunctions("=LOG10(A1)")).toEqual(["LOG10"]);
  });
  it("knows HyperFormula's function names", () => {
    expect(isSheetFunction("sum")).toBe(true);
    expect(isSheetFunction("AVERAGE")).toBe(true);
    expect(isSheetFunction("SUMM")).toBe(false);
  });
});

describe("spreadsheet type", () => {
  const def = spreadsheet.defSchema.parse(spreadsheetFixtures[0]);
  const { instance } = spreadsheet.generate(def, createRng("s"));
  const grade = (cells: Record<string, string> | null) => spreadsheet.grade(instance, cells ? { cells } : null, { points: 3 });

  it("gives full marks for the model solution", () => {
    expect(grade(instance.solution).score).toBe(3);
  });

  it("accepts a different formula that reaches the same value", () => {
    expect(grade({ D2: "=C2*B2", D3: "=C3*B3", D4: "=D2+D3" }).score).toBe(3);
  });

  it("insists on a formula only where the check says so", () => {
    // D3 may be typed by hand (requireFormula false); D2 and D4 may not.
    const r = grade({ D2: "6", D3: "24", D4: "30" });
    expect(r.lines.map((l) => l.verdict)).toEqual(["wrong", "correct", "wrong"]);
    expect(r.lines[0].note).toMatch(/typed in by hand/);
    expect(r.score).toBe(1);
  });

  it("scores each check on its own and shows what the cell contained", () => {
    const r = grade({ D2: "=B2*C2", D3: "=B3+C3", D4: "=SUM(D2:D3)" });
    expect(r.lines.map((l) => l.verdict)).toEqual(["correct", "wrong", "wrong"]);
    expect(r.lines[1].got).toBe("14");
    expect(r.lines[1].expected).toBe("24");
  });

  it("can require particular functions, and says which were used instead", () => {
    const fn = spreadsheet.defSchema.parse(spreadsheetFixtures[2]);
    const g = (cells: Record<string, string>) => spreadsheet.grade(fn, { cells }, { points: 1 });
    expect(g({ B5: "=SUM(B1:B4)" }).score).toBe(1);
    expect(g({ B5: "=sum(B1:B4)" }).score).toBe(1);
    const added = g({ B5: "=B1+B2+B3+B4" });
    expect(added.score).toBe(0);
    expect(added.lines[0].note).toBe("The value is right, but B5 must use SUM; it uses no function.");
    expect(added.lines[0].expected).toBe("140 (a formula using SUM)");
    const other = g({ B5: "=AVERAGE(B1:B4)*4" });
    expect(other.lines[0].note).toBe("The value is right, but B5 must use SUM; it uses AVERAGE.");
    expect(g({ B5: "140" }).lines[0].note).toBe("The value is right, but B5 was typed in by hand. This check needs a formula.");
    expect(g({ B5: "=SUM(B1:B3)" }).lines[0].note).toBe("Cell B5 shows 95.");
  });

  it("only lets students change their own cells", () => {
    // Trying to overwrite a given price is ignored: the sheet keeps the real data.
    expect(grade({ ...instance.solution, C2: "1000", B2: "1000" }).score).toBe(3);
  });

  it("treats an untouched sheet as unanswered", () => {
    expect(grade(null).lines.every((l) => l.verdict === "unanswered")).toBe(true);
    expect(grade({ D2: "  " }).lines.every((l) => l.verdict === "unanswered")).toBe(true);
  });

  it("hides the solution and checks from students", () => {
    const shown = JSON.stringify(spreadsheet.redact(instance));
    expect(shown).not.toMatch(/solution|checks|=B2\*C2|=SUM/);
    expect(shown).toContain("Pens");
  });

  it("validates grids, checks and the model solution", () => {
    const codes = (d: Partial<typeof def>) => spreadsheet.validateDef({ ...def, ...d }).map((i) => i.code);
    expect(spreadsheet.validateDef(def)).toEqual([]);
    expect(codes({ stem: " " })).toContain("spreadsheet.empty-stem");
    expect(codes({ cells: { ...def.cells, Z1: "x" } })).toContain("spreadsheet.cell-outside");
    expect(codes({ inputs: ["D2", "Q9"] })).toContain("spreadsheet.input-outside");
    expect(codes({ solution: { ...def.solution, A1: "x" } })).toContain("spreadsheet.solution-not-input");
    expect(codes({ inputs: [], solution: {} })).toContain("spreadsheet.no-inputs");
    expect(codes({ checks: [] })).toContain("spreadsheet.no-checks");
    expect(codes({ checks: [def.checks[0], def.checks[0]] })).toContain("spreadsheet.duplicate-check");
    expect(codes({ checks: [{ id: "x", cell: "ZZ99", label: "", requireFormula: false }] })).toEqual(
      expect.arrayContaining(["spreadsheet.check-outside", "spreadsheet.check-label"]),
    );
    expect(codes({ solution: { ...def.solution, D2: "6" } })).toContain("spreadsheet.formula-not-in-solution");
    expect(codes({ checks: [{ id: "x", cell: "A4", label: "Total label", requireFormula: false }, def.checks[1]], solution: def.solution })).not.toContain("spreadsheet.check-empty");
    expect(codes({ checks: [{ id: "x", cell: "D1", label: "Header", requireFormula: false }, ...def.checks.slice(1)], inputs: ["D2", "D3", "D4", "C4"], solution: { ...def.solution } })).not.toContain("spreadsheet.check-empty");
    expect(codes({ checks: [{ id: "x", cell: "C4", label: "Empty", requireFormula: false }] })).toContain("spreadsheet.check-empty");
    expect(codes({ solution: { ...def.solution, D4: "=1/0" } })).toContain("spreadsheet.solution-error");
    expect(codes({ cells: { ...def.cells, D2: "7" } })).toContain("spreadsheet.input-prefilled");
    const withFn = (functions: string[], d4 = def.solution.D4) =>
      codes({ checks: [def.checks[0], def.checks[1], { ...def.checks[2], functions }], solution: { ...def.solution, D4: d4 } });
    expect(withFn(["SUM"])).toEqual([]);
    expect(withFn(["SUMM"])).toContain("spreadsheet.unknown-function");
    expect(withFn(["SUM"], "=D2+D3")).toContain("spreadsheet.function-not-in-solution");
  });
});
