import type { McqDef } from "./core";

export const mcqFixtures: McqDef[] = [
  {
    stem: "Which organelle produces most of a cell's ATP?",
    options: [
      { id: "a", text: "Nucleus", correct: false },
      { id: "b", text: "Mitochondrion", correct: true, feedback: "Right: oxidative phosphorylation." },
      { id: "c", text: "Ribosome", correct: false },
      { id: "d", text: "Golgi apparatus", correct: false },
    ],
    multiple: false,
    shuffle: true,
    scoring: "all-or-nothing",
    penalty: 0.25,
  },
  {
    stem: "Select every prime number.",
    options: [
      { id: "2", text: "2", correct: true },
      { id: "4", text: "4", correct: false },
      { id: "7", text: "7", correct: true },
      { id: "9", text: "9", correct: false },
      { id: "11", text: "11", correct: true },
    ],
    multiple: true,
    shuffle: true,
    scoring: "right-minus-wrong",
    penalty: 0,
  },
  {
    stem: "Which are mammals?",
    options: [
      { id: "w", text: "Whale", correct: true },
      { id: "s", text: "Shark", correct: false },
      { id: "b", text: "Bat", correct: true },
    ],
    multiple: true,
    shuffle: false,
    scoring: "per-option",
    penalty: 0,
  },
];
