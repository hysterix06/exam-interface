import { z } from "zod";
import { evaluateSheet, formulaFunctions, sameValue, showValue } from "./sheet";
import type { GradeLine } from "./types";

// Checks on a sheet's cells, shared by the in-browser spreadsheet task and the
// uploaded-workbook (.xlsx) task: same rules, same explanation lines.

export const sheetCheckSchema = z.object({
  id: z.string().min(1),
  cell: z.string(),
  label: z.string(),
  abs: z.number().min(0).optional(),
  rel: z.number().min(0).optional(),
  /** The student must have typed a formula (=...) in this cell, not just a number. */
  requireFormula: z.boolean().default(false),
  /** The formula must call each of these functions (e.g. SUM). Implies a formula. */
  functions: z.array(z.string()).optional(),
});
export type SheetCheck = z.infer<typeof sheetCheckSchema>;

export const requiredFunctions = (c: { functions?: string[] }) => (c.functions ?? []).map((f) => f.trim().toUpperCase()).filter(Boolean);
export const both = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/**
 * One line per check. `keyCells` and `studentCells` are full raw sheets
 * (given content merged in); `typed` is what the student actually entered,
 * for the formula checks. Each check is worth an equal share.
 */
export function gradeSheetChecks(input: {
  rows: number;
  cols: number;
  checks: readonly SheetCheck[];
  keyCells: Readonly<Record<string, string>>;
  studentCells: Readonly<Record<string, string>>;
  typed: Readonly<Record<string, string>>;
  answered: boolean;
  points: number;
  /** Extra note appended to a check's line, e.g. a cached Excel value that differs. */
  noteFor?: (check: SheetCheck) => string | undefined;
}): GradeLine[] {
  const { rows, cols, checks, points, answered, typed } = input;
  const share = checks.length ? points / checks.length : points;
  const key = evaluateSheet(rows, cols, input.keyCells).values;
  const mine = evaluateSheet(rows, cols, input.studentCells).values;

  return checks.map((c): GradeLine => {
    const tol = { abs: c.abs, rel: c.rel };
    const fns = requiredFunctions(c);
    const expected = `${showValue(key[c.cell])}${fns.length ? ` (a formula using ${both(fns)})` : c.requireFormula ? " (typed as a formula)" : ""}`;
    if (!answered) return { label: c.label, expected, got: "no answer", verdict: "unanswered", points: 0, max: share };

    const got = showValue(mine[c.cell]);
    const valueOk = sameValue(key[c.cell] ?? null, mine[c.cell] ?? null, tol);
    const entered = (typed[c.cell] ?? "").trim();
    const formulaOk = !(c.requireFormula || fns.length > 0) || entered.startsWith("=");
    const used = formulaFunctions(entered);
    const fnsOk = fns.every((f) => used.includes(f));
    const ok = valueOk && formulaOk && fnsOk;
    const base = !valueOk
      ? `Cell ${c.cell} shows ${got}.`
      : !formulaOk
        ? `The value is right, but ${c.cell} was typed in by hand. This check needs a formula.`
        : !fnsOk
          ? `The value is right, but ${c.cell} must use ${both(fns)}; it uses ${used.length ? both(used) : "no function"}.`
          : `Cell ${c.cell} shows ${got}.`;
    const extra = input.noteFor?.(c);
    return { label: c.label, expected, got, verdict: ok ? "correct" : "wrong", points: ok ? share : 0, max: share, note: extra ? `${base} ${extra}` : base };
  });
}
