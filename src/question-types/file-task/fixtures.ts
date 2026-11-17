import type { FileTaskDef } from "./core";

export const fileTaskFixtures: FileTaskDef[] = [
  {
    stem: "Download the till report, total the takings in B6 with a formula, and add 20% VAT in B7.",
    starter: { assetId: "00000000-0000-4000-8000-000000000004", fileName: "till-report.xlsx" },
    sheetName: "",
    rows: 8,
    cols: 3,
    solution: { A1: "Item", B1: "Takings", A2: "Coffee", B2: "120", A3: "Tea", B3: "45.5", A4: "Cake", B4: "80", A6: "Total", B6: "=SUM(B2:B4)", A7: "With VAT", B7: "=B6*1.2" },
    checks: [
      { id: "t", cell: "B6", label: "Total takings", functions: ["SUM"], requireFormula: true },
      { id: "v", cell: "B7", label: "Total with VAT", abs: 0.01, requireFormula: true },
    ],
  },
];
