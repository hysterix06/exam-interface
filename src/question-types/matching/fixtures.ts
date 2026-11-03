import type { MatchingDef } from "./core";

export const matchingFixtures: MatchingDef[] = [
  {
    stem: "Match each organelle to its job.",
    pairs: [
      { id: "m", left: "Mitochondrion", right: "Makes ATP" },
      { id: "r", left: "Ribosome", right: "Builds proteins" },
      { id: "l", left: "Lysosome", right: "Breaks down waste" },
    ],
    distractors: ["Stores genetic code"],
  },
  {
    stem: "Match the country to its capital.",
    pairs: [
      { id: "f", left: "France", right: "Paris" },
      { id: "j", left: "Japan", right: "Tokyo" },
    ],
    distractors: [],
  },
];
