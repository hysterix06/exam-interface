import { z } from "zod";
import { quote, roundScore } from "@/engine/grading/format";
import { defineQuestionType } from "@/engine/question-type";
import { evaluateSheet, inGrid, MAX_COLS, MAX_ROWS, parseAddr, sameValue, showValue } from "@/engine/sheet";
import type { GradeLine, PreflightIssue } from "@/engine/types";

const checkSchema = z.object({
  id: z.string().min(1),
  cell: z.string(),
  label: z.string(),
  abs: z.number().min(0).optional(),
  rel: z.number().min(0).optional(),
  /** The student must have typed a formula (=...) in this cell, not just a number. */
  requireFormula: z.boolean().default(false),
});

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
    const share = inst.checks.length ? points / inst.checks.length : points;
    const answered = inst.inputs.some((a) => (entries[a] ?? "").trim() !== "");

    const key = evaluateSheet(inst.rows, inst.cols, merged(inst, inst.solution)).values;
    const mine = evaluateSheet(inst.rows, inst.cols, merged(inst, entries)).values;

    const lines = inst.checks.map((c): GradeLine => {
      const tol = { abs: c.abs, rel: c.rel };
      const expected = `${showValue(key[c.cell])}${c.requireFormula ? " (typed as a formula)" : ""}`;
      if (!answered) return { label: c.label, expected, got: "no answer", verdict: "unanswered", points: 0, max: share };

      const got = showValue(mine[c.cell]);
      const valueOk = sameValue(key[c.cell] ?? null, mine[c.cell] ?? null, tol);
      const typed = (entries[c.cell] ?? "").trim();
      const formulaOk = !c.requireFormula || typed.startsWith("=");
      const ok = valueOk && formulaOk;
      const note = !valueOk
        ? `Cell ${c.cell} shows ${got}.`
        : !formulaOk
          ? `The value is right, but ${c.cell} was typed in by hand. This check needs a formula.`
          : `Cell ${c.cell} shows ${got}.`;
      return { label: c.label, expected, got, verdict: ok ? "correct" : "wrong", points: ok ? share : 0, max: share, note };
    });
    return { score: roundScore(lines.reduce((s, l) => s + l.points, 0)), max: points, needsReview: false, lines };
  },

  keyResponse: (inst) => ({ cells: { ...inst.solution } }),

  randomResponse(inst, rng) {
    if (rng.next() < 0.33) return { cells: { ...inst.solution } };
    return { cells: Object.fromEntries(inst.inputs.map((a) => [a, String(rng.int(0, 99))])) };
  },

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

