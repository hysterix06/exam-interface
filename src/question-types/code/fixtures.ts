import type { CodeDef } from "./core";

export const codeFixtures: CodeDef[] = [
  {
    stem: "Write `total(prices)` that returns the sum of an array of prices, rounded to 2 decimal places.",
    language: "javascript",
    starter: "function total(prices) {\n  // your code\n}\n",
    solution: "function total(prices) {\n  return Math.round(prices.reduce((s, p) => s + p, 0) * 100) / 100;\n}\n",
    tests: [
      { id: "a", label: "Three prices", call: "total([1.5, 2.25, 3])", expected: "6.75", hidden: false },
      { id: "b", label: "Empty", call: "total([])", expected: "0", hidden: false },
      { id: "c", label: "Rounding", call: "total([0.1, 0.2])", expected: "0.3", hidden: true },
    ],
    stepLimit: 2000,
  },
  {
    stem: "Write `byCategory(items)` that groups `{name, category}` objects into `{category: [names]}`.",
    language: "javascript",
    starter: "const byCategory = (items) => ({});\n",
    solution: "const byCategory = (items) => items.reduce((acc, i) => ((acc[i.category] ??= []).push(i.name), acc), {});\n",
    tests: [
      { id: "a", label: "Two groups", call: 'byCategory([{name:"tea",category:"drink"},{name:"cake",category:"food"},{name:"coffee",category:"drink"}])', expected: '{"drink":["tea","coffee"],"food":["cake"]}', hidden: false },
      { id: "b", label: "Nothing", call: "byCategory([])", expected: "{}", hidden: true },
    ],
    stepLimit: 2000,
  },
];
