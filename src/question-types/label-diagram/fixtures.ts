import type { LabelDiagramDef } from "./core";

export const labelDiagramFixtures: LabelDiagramDef[] = [
  {
    stem: "Drag each label to its pin.",
    image: { assetId: "00000000-0000-4000-8000-000000000001", width: 800, height: 600, alt: "Animal cell with three numbered pins" },
    pins: [
      { id: "p1", x: 0.5, y: 0.5, labelId: "nucleus" },
      { id: "p2", x: 0.27, y: 0.33, labelId: "mito" },
      { id: "p3", x: 0.9, y: 0.5, labelId: "membrane" },
    ],
    labels: [
      { id: "nucleus", text: "Nucleus" },
      { id: "mito", text: "Mitochondrion" },
      { id: "membrane", text: "Cell membrane" },
      { id: "wall", text: "Cell wall" },
    ],
    penalty: 0,
  },
  {
    stem: "Label the two chambers.",
    image: { assetId: "00000000-0000-4000-8000-000000000002", width: 400, height: 400, alt: "Heart outline with two pins" },
    pins: [
      { id: "a", x: 0.3, y: 0.6, labelId: "rv" },
      { id: "b", x: 0.7, y: 0.6, labelId: "lv" },
    ],
    labels: [
      { id: "rv", text: "Right ventricle" },
      { id: "lv", text: "Left ventricle" },
    ],
    penalty: 0.5,
  },
];
