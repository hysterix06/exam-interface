import type { LongAnswerDef } from "./core";

export const longAnswerFixtures: LongAnswerDef[] = [
  {
    stem: "Explain how a cell obtains energy from glucose.",
    rubric: [
      { id: "g", text: "Mentions glycolysis", points: 1 },
      { id: "k", text: "Mentions the Krebs cycle or the electron transport chain", points: 2 },
      { id: "a", text: "States that ATP is produced", points: 1 },
    ],
    maxWords: 200,
    keywords: ["glycolysis", "ATP", "mitochondria"],
  },
  { stem: "Describe one cause of a changing climate.", rubric: [{ id: "c", text: "Gives a cause with a reason", points: 1 }], maxWords: null, keywords: [] },
];
