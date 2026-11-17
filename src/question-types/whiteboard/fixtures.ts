import type { WhiteboardDef } from "./core";

export const whiteboardFixtures: WhiteboardDef[] = [
  {
    stem: "Sketch a graph of enzyme activity against temperature.",
    background: null,
    rubric: [
      { id: "rise", text: "Activity rises with temperature at first", points: 1 },
      { id: "peak", text: "A clear optimum", points: 1 },
      { id: "fall", text: "A steep fall after the optimum (denaturing)", points: 2 },
    ],
  },
  {
    stem: "Draw arrows showing the direction of blood flow.",
    background: { assetId: "00000000-0000-4000-8000-000000000003", width: 600, height: 600, alt: "Outline of the heart" },
    rubric: [{ id: "a", text: "Arrows into the atria and out of the ventricles", points: 1 }],
  },
];
