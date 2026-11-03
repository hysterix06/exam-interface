import type { ShortAnswerDef } from "./core";

export const shortAnswerFixtures: ShortAnswerDef[] = [
  {
    stem: "What is the capital of France?",
    match: { kind: "text", accepted: ["Paris"], caseSensitive: false, collapseWhitespace: true },
  },
  {
    stem: "Spell the word for the visible spectrum's attribute (US or UK spelling).",
    match: { kind: "regex", pattern: "colou?r", caseSensitive: false, example: "color" },
  },
  {
    stem: "Acceleration due to gravity at Earth's surface?",
    match: { kind: "numeric", value: 9.81, tolerance: { abs: 0.05 }, units: ["m/s^2", "m/s²"] },
  },
  {
    stem: "How many chromosomes are in a human somatic cell?",
    match: { kind: "numeric", value: 46, tolerance: {} },
  },
];
