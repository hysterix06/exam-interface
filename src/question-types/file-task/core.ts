import { z } from "zod";
import { roundScore } from "@/engine/grading/format";
import { WRONG_TEXT } from "@/engine/grading/text";
import { defineQuestionType } from "@/engine/question-type";
import { evaluateSheet, inGrid, isSheetFunction, MAX_COLS, MAX_ROWS, parseAddr } from "@/engine/sheet";
import { both, gradeSheetChecks, requiredFunctions, sheetCheckSchema } from "@/engine/sheet-checks";
import type { PreflightIssue } from "@/engine/types";

// A task done in real Excel (or Numbers, or Sheets): the student downloads a
// starter workbook, works offline, and uploads the .xlsx. The server reads it
// into cells and the same checks as the in-browser spreadsheet grade it, so
// values, formulas and functions are all checked.

const defSchema = z.object({
  stem: z.string(),
  /** Optional workbook students download to start from (an uploaded asset). */
  starter: z.object({ assetId: z.string(), fileName: z.string() }).nullable().default(null),
  /** Which sheet to read; the first one when blank. */
  sheetName: z.string().default(""),
  /** The area that is read and recalculated. */
  rows: z.number().int().min(1).max(MAX_ROWS),
  cols: z.number().int().min(1).max(MAX_COLS),
  /** A complete correct workbook, as cells (read from the author's own upload, or typed). */
  solution: z.record(z.string(), z.string()),
  checks: z.array(sheetCheckSchema),
});
const instanceSchema = defSchema;
const responseSchema = z.object({
  fileName: z.string(),
  sha256: z.string(),
  bytes: z.number().int().min(0),
  cells: z.record(z.string(), z.string()),
  warnings: z.array(z.string()).default([]),
});

export type FileTaskDef = z.infer<typeof defSchema>;
export type FileTaskInstance = z.infer<typeof instanceSchema>;
export type FileTaskResponse = z.infer<typeof responseSchema>;

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const fileTask = defineQuestionType<FileTaskDef, FileTaskInstance, FileTaskResponse>({
  id: "file-task",
  label: "Upload a workbook (.xlsx)",
  serverResponse: true,
  defSchema,
  instanceSchema,
  responseSchema,

  generate: (def) => ({ instance: def, vars: {} }),

  grade(inst, response, { points }) {
    const cells = response?.cells ?? {};
    const lines = gradeSheetChecks({
      rows: inst.rows,
      cols: inst.cols,
      checks: inst.checks,
      keyCells: inst.solution,
      studentCells: cells,
      typed: cells,
      answered: response !== null && Object.keys(cells).length > 0,
      points,
    });
    const warn = response?.warnings.length ? ` From the upload: ${response.warnings.join(" ")}` : "";
    if (warn && lines.length) lines[0] = { ...lines[0], note: `${lines[0].note ?? ""}${warn}`.trim() };
    return { score: roundScore(lines.reduce((s, l) => s + l.points, 0)), max: points, needsReview: false, lines };
  },

  keyResponse: (inst) => ({ fileName: "model-solution.xlsx", sha256: "", bytes: 0, cells: { ...inst.solution }, warnings: [] }),
  randomResponse(inst, rng) {
    if (rng.next() < 0.33) return { fileName: "random.xlsx", sha256: "", bytes: 0, cells: { ...inst.solution }, warnings: [] };
    return { fileName: "random.xlsx", sha256: "", bytes: 0, cells: Object.fromEntries(inst.checks.map((c) => [c.cell, String(rng.int(0, 99))])), warnings: [] };
  },
  wrongResponse: (inst) => ({ fileName: "wrong.xlsx", sha256: "", bytes: 0, cells: Object.fromEntries(inst.checks.map((c) => [c.cell, WRONG_TEXT])), warnings: [] }),
  // Downloading, working in a desktop app, uploading.
  estimateSeconds: (def) => 300 + 60 * def.checks.length,

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    const block = (code: string, message: string, path?: string) => issues.push({ severity: "blocking", code, message, path });
    if (!def.stem.trim()) block("file-task.empty-stem", "The question has no text.", "stem");
    if (def.checks.length === 0) block("file-task.no-checks", "Add at least one check, so the task can be graded.", "checks");
    if (Object.keys(def.solution).length === 0) block("file-task.no-solution", "Add the model solution: upload a finished workbook or type its cells.", "solution");
    for (const a of Object.keys(def.solution)) if (!inGrid(a, def.rows, def.cols)) block("file-task.solution-outside", `The solution has ${a}, outside the ${def.rows}×${def.cols} area that is read.`, "solution");
    if (new Set(def.checks.map((c) => c.id)).size !== def.checks.length) block("file-task.duplicate-check", "Two checks share the same id.", "checks");
    for (const c of def.checks) {
      if (!parseAddr(c.cell) || !inGrid(c.cell, def.rows, def.cols)) block("file-task.check-outside", `Check “${c.label}” points at ${c.cell}, outside the area that is read.`, "checks");
      if (!c.label.trim()) block("file-task.check-label", `The check on ${c.cell} needs a label.`, "checks");
      const fns = requiredFunctions(c);
      for (const f of fns) if (!isSheetFunction(f)) block("file-task.unknown-function", `Check “${c.label}” requires ${f}, which isn't a spreadsheet function.`, "checks");
      if ((c.requireFormula || fns.length) && !(def.solution[c.cell] ?? "").trim().startsWith("=")) {
        block("file-task.formula-not-in-solution", `${c.cell} must be a formula${fns.length ? ` using ${both(fns)}` : ""}, but the model solution there isn't one.`, "checks");
      }
    }
    if (issues.length === 0) {
      const key = evaluateSheet(def.rows, def.cols, def.solution).values;
      for (const c of def.checks) {
        if (key[c.cell] === undefined) block("file-task.check-empty", `In the model solution, ${c.cell} (“${c.label}”) is empty.`, "checks");
        else if (key[c.cell] === "#ERROR") block("file-task.solution-error", `In the model solution, ${c.cell} (“${c.label}”) is an error.`, "solution");
      }
    }
    if (!def.starter) issues.push({ severity: "warning", code: "file-task.no-starter", message: "There's no starter workbook, so students begin from a blank file.", path: "starter" });
    return issues;
  },

  redact: ({ stem, starter, sheetName, rows, cols }) => ({ stem, starter, sheetName, rows, cols }),
});
