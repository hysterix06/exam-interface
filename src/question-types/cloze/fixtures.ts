import type { ClozeDef } from "./core";

export const clozeFixtures: ClozeDef[] = [
  { template: "The capital of France is {{text:Paris|paris}} and 2 + 2 is {{num:4}}." },
  { template: "Water boils at {{num:100±1}} °C, and ice is {{select:hot|cold*|loud}}." },
  { template: "A reading of {{num:50±10%}} counts as close, in a {{select:lab*|kitchen}}." },
];
