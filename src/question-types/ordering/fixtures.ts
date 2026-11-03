import type { OrderingDef } from "./core";

export const orderingFixtures: OrderingDef[] = [
  {
    stem: "Put the stages of mitosis in order.",
    items: [
      { id: "p", text: "Prophase" },
      { id: "m", text: "Metaphase" },
      { id: "a", text: "Anaphase" },
      { id: "t", text: "Telophase" },
    ],
  },
  {
    stem: "Order these from smallest to largest.",
    items: [
      { id: "1", text: "Atom" },
      { id: "2", text: "Molecule" },
      { id: "3", text: "Cell" },
    ],
  },
];
