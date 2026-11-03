import type { DropdownDef } from "./core";

export const dropdownFixtures: DropdownDef[] = [
  {
    stem: "The powerhouse of the cell is the…",
    options: [
      { id: "n", text: "nucleus" },
      { id: "m", text: "mitochondrion" },
      { id: "v", text: "vacuole" },
    ],
    answer: "m",
    shuffle: true,
  },
];
