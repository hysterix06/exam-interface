import type { TableFillDef } from "./core";

export const tableFillFixtures: TableFillDef[] = [
  {
    stem: "Complete the table of unit prices.",
    columns: ["Item", "Quantity", "Total ($)"],
    rows: [
      ["Pens", "{{num:4}}", "8"],
      ["Books", "3", "{{num:30±1}}"],
      ["{{text:Mugs|Cups}}", "2", "{{num:10}}"],
    ],
  },
  {
    stem: "Classify each animal.",
    columns: ["Animal", "Class"],
    rows: [
      ["Frog", "{{select:Mammal|Amphibian*|Bird}}"],
      ["Eagle", "{{select:Mammal|Amphibian|Bird*}}"],
    ],
  },
];
