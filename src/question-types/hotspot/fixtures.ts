import type { HotspotDef } from "./core";

const image = { assetId: "00000000-0000-4000-8000-000000000001", width: 800, height: 600, alt: "Diagram of an animal cell" };

export const hotspotFixtures: HotspotDef[] = [
  {
    stem: "Click the nucleus.",
    image,
    regions: [
      { id: "n", label: "Nucleus", shape: { kind: "circle", cx: 0.5, cy: 0.5, r: 0.12 }, correct: true },
      { id: "m", label: "Mitochondrion", shape: { kind: "rect", x: 0.1, y: 0.1, w: 0.15, h: 0.1 }, correct: false },
    ],
    multiple: false,
    penalty: 0.25,
  },
  {
    stem: "Click every organelle that makes energy available.",
    image,
    regions: [
      { id: "m1", label: "Mitochondrion (top)", shape: { kind: "polygon", points: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.2], [0.15, 0.25]] }, correct: true },
      { id: "m2", label: "Mitochondrion (bottom)", shape: { kind: "rect", x: 0.6, y: 0.7, w: 0.2, h: 0.1 }, correct: true },
      { id: "n", label: "Nucleus", shape: { kind: "circle", cx: 0.5, cy: 0.45, r: 0.1 }, correct: false },
    ],
    multiple: true,
    penalty: 0.5,
  },
];
