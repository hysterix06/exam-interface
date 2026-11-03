import type { SpreadsheetDef } from "./core";

export const spreadsheetFixtures: SpreadsheetDef[] = [
  {
    stem: "Work out the cost of each line, then the grand total, using formulas.",
    rows: 5,
    cols: 4,
    cells: {
      A1: "Item", B1: "Qty", C1: "Price", D1: "Cost",
      A2: "Pens", B2: "4", C2: "1.5",
      A3: "Books", B3: "2", C3: "12",
      A4: "Total",
    },
    inputs: ["D2", "D3", "D4"],
    solution: { D2: "=B2*C2", D3: "=B3*C3", D4: "=SUM(D2:D3)" },
    checks: [
      { id: "c1", cell: "D2", label: "Cost of pens", requireFormula: true },
      { id: "c2", cell: "D3", label: "Cost of books", requireFormula: false },
      { id: "c3", cell: "D4", label: "Grand total", requireFormula: true },
    ],
  },
  {
    stem: "Enter the average of the three scores in B4.",
    rows: 4,
    cols: 2,
    cells: { A1: "Test 1", B1: "70", A2: "Test 2", B2: "80", A3: "Test 3", B3: "90", A4: "Average" },
    inputs: ["B4"],
    solution: { B4: "=AVERAGE(B1:B3)" },
    checks: [{ id: "avg", cell: "B4", label: "Average score", abs: 0.01, requireFormula: false }],
  },
];
