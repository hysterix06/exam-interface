import { z } from "zod";
import { quote, roundScore } from "@/engine/grading/format";
import { WRONG_TEXT } from "@/engine/grading/text";
import { defineQuestionType } from "@/engine/question-type";
import { evaluateSheet, formulaFunctions, inGrid, isSheetFunction, MAX_COLS, MAX_ROWS, parseAddr } from "@/engine/sheet";
import { both, gradeSheetChecks, requiredFunctions, sheetCheckSchema } from "@/engine/sheet-checks";
import type { PreflightIssue } from "@/engine/types";

const checkSchema = sheetCheckSchema;
const required = requiredFunctions;

const defSchema = z.object({
  stem: z.string(),
  rows: z.number().int().min(1).max(MAX_ROWS),
  cols: z.number().int().min(1).max(MAX_COLS),
  /** Given content: addresses to raw text ("10", "Price", "=A1*2"). */
  cells: z.record(z.string(), z.string()),
  /** Cells the student may edit. */
  inputs: z.array(z.string()),
  /** The model solution: what the key puts in the input cells. */
  solution: z.record(z.string(), z.string()),
  checks: z.array(checkSchema),
});

const instanceSchema = defSchema;
const responseSchema = z.object({ cells: z.record(z.string(), z.string()) });

export type SpreadsheetDef = z.infer<typeof defSchema>;
export type SpreadsheetInstance = z.infer<typeof instanceSchema>;
export type SpreadsheetResponse = z.infer<typeof responseSchema>;

/** Given cells, overlaid with the entries for the allowed input cells only. */
function merged(inst: SpreadsheetInstance, entries: Record<string, string>) {
  const out: Record<string, string> = { ...inst.cells };
  for (const a of inst.inputs) if (entries[a] !== undefined) out[a] = entries[a];
  // An input cell the student left empty must not keep any given text.
  for (const a of inst.inputs) if (entries[a] === undefined || entries[a].trim() === "") delete out[a];
  return out;
}

export const spreadsheet = defineQuestionType<SpreadsheetDef, SpreadsheetInstance, SpreadsheetResponse>({
  id: "spreadsheet",
  label: "Spreadsheet task",
  defSchema,
  instanceSchema,
  responseSchema,

  generate: (def) => ({ instance: def, vars: {} }),

  grade(inst, response, { points }) {
    const entries = response?.cells ?? {};
    const lines = gradeSheetChecks({
      rows: inst.rows,
      cols: inst.cols,
      checks: inst.checks,
      keyCells: merged(inst, inst.solution),
      studentCells: merged(inst, entries),
      typed: entries,
      answered: inst.inputs.some((a) => (entries[a] ?? "").trim() !== ""),
      points,
    });
    return { score: roundScore(lines.reduce((s, l) => s + l.points, 0)), max: points, needsReview: false, lines };
  },

  keyResponse: (inst) => ({ cells: { ...inst.solution } }),

  randomResponse(inst, rng) {
    if (rng.next() < 0.33) return { cells: { ...inst.solution } };
    return { cells: Object.fromEntries(inst.inputs.map((a) => [a, String(rng.int(0, 99))])) };
  },

  // Text in every student cell: no number or formula check can pass.
  wrongResponse: (inst) => ({ cells: Object.fromEntries(inst.inputs.map((a) => [a, WRONG_TEXT])) }),

  estimateSeconds: (def) => 60 + 60 * def.checks.length,

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    const block = (code: string, message: string, path?: string) => issues.push({ severity: "blocking", code, message, path });
    if (!def.stem.trim()) block("spreadsheet.empty-stem", "The question has no text.", "stem");

    const bad = (a: string) => !inGrid(a, def.rows, def.cols);
    for (const a of Object.keys(def.cells)) if (bad(a)) block("spreadsheet.cell-outside", `Cell ${quote(a)} is outside the ${def.rows}×${def.cols} grid.`, "cells");
    for (const a of def.inputs) if (bad(a)) block("spreadsheet.input-outside", `Student cell ${quote(a)} is outside the grid.`, "inputs");
    for (const a of Object.keys(def.solution)) {
      if (!def.inputs.includes(a)) block("spreadsheet.solution-not-input", `The solution fills ${a}, which isn't a student cell.`, "solution");
    }
    if (def.inputs.length === 0) block("spreadsheet.no-inputs", "Mark at least one cell for the student to fill in.", "inputs");
    if (def.checks.length === 0) block("spreadsheet.no-checks", "Add at least one check, so the task can be graded.", "checks");
    const ids = def.checks.map((c) => c.id);
    if (new Set(ids).size !== ids.length) block("spreadsheet.duplicate-check", "Two checks share the same id.", "checks");

    for (const c of def.checks) {
      if (!parseAddr(c.cell) || bad(c.cell)) block("spreadsheet.check-outside", `Check “${c.label}” points at ${quote(c.cell)}, which isn't a cell in the grid.`, "checks");
      if (!c.label.trim()) block("spreadsheet.check-label", `The check on ${c.cell} needs a label.`, "checks");
      if (c.requireFormula && !(def.solution[c.cell] ?? "").trim().startsWith("=")) {
        block("spreadsheet.formula-not-in-solution", `${c.cell} requires a formula, but the model solution doesn't use one there.`, "checks");
      }
      const fns = required(c);
      for (const f of fns) if (!isSheetFunction(f)) block("spreadsheet.unknown-function", `Check “${c.label}” requires ${quote(f)}, which isn't a spreadsheet function.`, "checks");
      const inSolution = formulaFunctions(def.solution[c.cell] ?? "");
      const missing = fns.filter((f) => isSheetFunction(f) && !inSolution.includes(f));
      if (missing.length) block("spreadsheet.function-not-in-solution", `${c.cell} must use ${both(missing)}, but the model solution there doesn't.`, "checks");
    }
    if (issues.length === 0) {
      const key = evaluateSheet(def.rows, def.cols, merged(def, def.solution)).values;
      for (const c of def.checks) {
        const v = key[c.cell];
        if (v === undefined) block("spreadsheet.check-empty", `With the model solution, ${c.cell} (“${c.label}”) is empty. Nothing to check.`, "checks");
        else if (v === "#ERROR") block("spreadsheet.solution-error", `With the model solution, ${c.cell} (“${c.label}”) is an error. Fix the formula.`, "solution");
      }
      for (const a of def.inputs) if ((def.cells[a] ?? "").trim() !== "") {
        issues.push({ severity: "warning", code: "spreadsheet.input-prefilled", message: `${a} has given content but is also a student cell; students start with it empty.`, path: "cells" });
      }
    }
    return issues;
  },

  redact: ({ stem, rows, cols, cells, inputs }) => ({ stem, rows, cols, cells, inputs }),
});

