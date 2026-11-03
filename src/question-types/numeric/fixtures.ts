import type { NumericDef } from "./core";

export const numericFixtures: NumericDef[] = [
  {
    stem: "A shop sells {n} notebooks at ${price} each. What is the total cost?",
    variables: [
      { kind: "int", name: "n", min: 2, max: 9 },
      { kind: "float", name: "price", min: 1, max: 5, decimals: 2 },
    ],
    constraints: [],
    answer: "n * price",
    tolerance: { abs: 0.01 },
  },
  {
    stem: "{a} ÷ {b} = ? (a whole number, in cm)",
    variables: [
      { kind: "int", name: "a", min: 10, max: 90 },
      { kind: "int", name: "b", min: 2, max: 9 },
    ],
    constraints: ["b != a", "answer == round(answer)"],
    answer: "a / b",
    tolerance: {},
    units: ["cm"],
  },
  {
    stem: "{item} costs ${cost}. With {tax}% tax, what is the total?",
    variables: [
      { kind: "pick", name: "item", options: ["A pen", "A mug", "A book"] },
      { kind: "pick", name: "cost", options: ["10", "20", "40"] },
      { kind: "pick", name: "tax", options: ["5", "10"] },
    ],
    constraints: [],
    answer: "cost * (1 + tax / 100)",
    tolerance: { rel: 0.01 },
  },
];
