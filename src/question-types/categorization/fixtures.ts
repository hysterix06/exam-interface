import type { CategorizationDef } from "./core";

export const categorizationFixtures: CategorizationDef[] = [
  {
    stem: "Sort each organism into its kingdom.",
    categories: [
      { id: "animal", name: "Animals" },
      { id: "plant", name: "Plants" },
      { id: "fungus", name: "Fungi" },
    ],
    items: [
      { id: "a", text: "Oak tree", category: "plant" },
      { id: "b", text: "Mushroom", category: "fungus" },
      { id: "c", text: "Sparrow", category: "animal" },
      { id: "d", text: "Moss", category: "plant" },
      { id: "e", text: "Yeast", category: "fungus" },
    ],
    penalty: 0,
  },
  {
    stem: "Renewable or not?",
    categories: [
      { id: "r", name: "Renewable" },
      { id: "n", name: "Non-renewable" },
    ],
    items: [
      { id: "1", text: "Solar", category: "r" },
      { id: "2", text: "Coal", category: "n" },
      { id: "3", text: "Wind", category: "r" },
    ],
    penalty: 0.5,
  },
];
