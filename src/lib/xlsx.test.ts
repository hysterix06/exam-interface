import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseWorkbook } from "./xlsx";

async function workbook(fill: (s: ExcelJS.Worksheet) => void, name = "Sheet1") {
  const wb = new ExcelJS.Workbook();
  fill(wb.addWorksheet(name));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("parseWorkbook", () => {
  it("reads values and formulas into the spreadsheet cell model", async () => {
    const bytes = await workbook((s) => {
      s.getCell("A1").value = "Price";
      s.getCell("B1").value = 12.5;
      s.getCell("B2").value = 3;
      s.getCell("B3").value = { formula: "SUM(B1:B2)", result: 15.5 } as ExcelJS.CellFormulaValue;
      s.getCell("C1").value = true;
    });
    const r = await parseWorkbook(bytes, { rows: 10, cols: 5 });
    expect(r).toEqual({ cells: { A1: "Price", B1: "12.5", B2: "3", B3: "=SUM(B1:B2)", C1: "TRUE" }, warnings: [], sheetName: "Sheet1" });
  });

  it("ignores cells outside the grid and names the sheet it fell back to", async () => {
    const bytes = await workbook((s) => {
      s.getCell("A1").value = 1;
      s.getCell("Z99").value = 2;
    }, "Data");
    const r = await parseWorkbook(bytes, { rows: 5, cols: 5, sheetName: "Answers" });
    if ("error" in r) throw new Error(r.error);
    expect(r.cells).toEqual({ A1: "1" });
    expect(r.warnings.join(" ")).toMatch(/no sheet called “Answers”.*1 cell outside/);
  });

  it("flags functions it can't recalculate and refuses non-workbooks", async () => {
    const bytes = await workbook((s) => {
      s.getCell("A1").value = { formula: "NOTAFUNCTION(1)", result: 1 } as ExcelJS.CellFormulaValue;
    });
    const r = await parseWorkbook(bytes, { rows: 5, cols: 5 });
    if ("error" in r) throw new Error(r.error);
    expect(r.warnings[0]).toMatch(/NOTAFUNCTION/);
    expect(await parseWorkbook(new Uint8Array([0x50, 0x4b, 3, 4, 0]), { rows: 5, cols: 5 })).toHaveProperty("error");
  });
});
