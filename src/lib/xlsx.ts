// Read an uploaded .xlsx into the same cell model the spreadsheet task uses
// ("B3" -> "12" or "=SUM(B1:B2)"), so one set of checks grades both. Only
// server code imports this (ExcelJS is large and Node-only).
import ExcelJS from "exceljs";
import { addr, isSheetFunction, formulaFunctions } from "@/engine/sheet";

export interface ParsedWorkbook {
  cells: Record<string, string>;
  /** Plain-language notes for the student and the marker; never change the score. */
  warnings: string[];
  sheetName: string;
}

type Cell = ExcelJS.Cell;

function rawText(cell: Cell): string | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("formula" in v && typeof v.formula === "string") return `=${v.formula}`;
    if ("sharedFormula" in v && typeof v.sharedFormula === "string") {
      // A copied formula: ExcelJS gives the master's text; fall back to the stored result.
      const result = (v as { result?: unknown }).result;
      return result === undefined || result === null ? null : String(result);
    }
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("error" in v) return "#ERROR";
  }
  return null;
}

/**
 * The first sheet (or the named one), limited to rows × cols. Content outside
 * the grid is ignored with a warning; formulas keep their text so the grader
 * can check which functions were used.
 */
export async function parseWorkbook(bytes: Uint8Array, opts: { rows: number; cols: number; sheetName?: string }): Promise<ParsedWorkbook | { error: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    return { error: "That file isn't a readable .xlsx workbook. Save it from Excel, Numbers or Sheets as .xlsx and try again." };
  }
  const sheet = (opts.sheetName ? wb.getWorksheet(opts.sheetName) : undefined) ?? wb.worksheets[0];
  if (!sheet) return { error: "The workbook has no sheets." };

  const cells: Record<string, string> = {};
  const warnings: string[] = [];
  let outside = 0;
  const unknown = new Set<string>();
  sheet.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const text = rawText(cell);
      if (text === null || text.trim() === "") return;
      if (r > opts.rows || c > opts.cols) {
        outside++;
        return;
      }
      cells[addr(r - 1, c - 1)] = text;
      if (text.startsWith("=")) for (const f of formulaFunctions(text)) if (!isSheetFunction(f)) unknown.add(f);
    });
  });
  if (opts.sheetName && sheet.name !== opts.sheetName) warnings.push(`There's no sheet called “${opts.sheetName}”, so “${sheet.name}” was read instead.`);
  if (outside) warnings.push(`${outside} ${outside === 1 ? "cell" : "cells"} outside the marked area (${addr(opts.rows - 1, opts.cols - 1)} and before) ${outside === 1 ? "was" : "were"} ignored.`);
  if (unknown.size) warnings.push(`These functions can't be recalculated here, so cells using them may show an error: ${[...unknown].join(", ")}.`);
  return { cells, warnings, sheetName: sheet.name };
}
