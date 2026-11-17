import type { CompositeDef } from "./core";

export const compositeFixtures: CompositeDef[] = [
  {
    stem: "Read the field notes, then answer the questions.",
    stimulus: "| Quadrat | Snails | Area (m²) |\n|---|---|---|\n| A | 12 | 0.5 |\n| B | 30 | 1 |",
    shuffleParts: false,
    parts: [
      {
        id: "p1",
        type: "mcq",
        label: "Reading the table",
        weight: 1,
        def: {
          stem: "Which quadrat has the higher density?",
          options: [
            { id: "a", text: "A", correct: false },
            { id: "b", text: "B", correct: true },
          ],
          multiple: false,
          shuffle: true,
          scoring: "all-or-nothing",
          penalty: 0,
        },
      },
      { id: "p2", type: "cloze", weight: 2, def: { template: "Quadrat A holds {{num:24}} snails per m², which is {{select:more|fewer*}} than B." } },
      {
        id: "p3",
        type: "numeric",
        weight: 1,
        def: {
          stem: "A third quadrat of {a} m² holds {n} snails. What is its density?",
          variables: [
            { kind: "int", name: "n", min: 5, max: 40 },
            { kind: "pick", name: "a", options: ["0.5", "2"] },
          ],
          constraints: [],
          answer: "n / a",
          tolerance: { rel: 0.01 },
        },
      },
    ],
  },
  {
    stem: "Read the abstract and answer both parts.",
    stimulus: "Bacteria exposed to low doses of antibiotic over 20 generations became **resistant** to high doses.",
    shuffleParts: true,
    parts: [
      { id: "p1", type: "true-false", weight: 1, def: { stem: "The bacteria became resistant.", answer: true, penalty: 0 } },
      {
        id: "p2",
        type: "long-answer",
        weight: 3,
        def: { stem: "Explain how resistance spread.", rubric: [{ id: "v", text: "Variation", points: 1 }, { id: "s", text: "Selection", points: 2 }], maxWords: 120, keywords: ["selection"] },
      },
    ],
  },
];
