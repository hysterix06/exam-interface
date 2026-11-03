// Demo question bank for BIO 101. Plain data; the seed turns it into
// topics, questions, versions and a draft exam.
import type { DropdownDef } from "@/question-types/dropdown/core";
import type { McqDef } from "@/question-types/mcq/core";
import type { ShortAnswerDef } from "@/question-types/short-answer/core";
import type { TrueFalseDef } from "@/question-types/true-false/core";

export const DEMO_TOPICS = ["Cell Biology", "Genetics", "Ecology"] as const;
export type DemoTopic = (typeof DEMO_TOPICS)[number];

interface DemoQuestion {
  topic: DemoTopic;
  type: "mcq" | "true-false" | "dropdown" | "short-answer";
  difficulty: 1 | 2 | 3;
  def: McqDef | TrueFalseDef | DropdownDef | ShortAnswerDef;
}

const opts = (correct: string, ...wrong: string[]) => [
  { id: "a", text: correct, correct: true },
  ...wrong.map((text, i) => ({ id: String.fromCharCode(98 + i), text, correct: false })),
];

const mcq = (stem: string, correct: string, ...wrong: string[]): McqDef => ({
  stem,
  options: opts(correct, ...wrong),
  multiple: false,
  shuffle: true,
  scoring: "all-or-nothing",
  penalty: 0,
});

export const DEMO_QUESTIONS: DemoQuestion[] = [
  { topic: "Cell Biology", type: "mcq", difficulty: 1, def: mcq("Which organelle produces most of a cell's ATP?", "Mitochondrion", "Nucleus", "Ribosome", "Golgi apparatus") },
  { topic: "Cell Biology", type: "mcq", difficulty: 1, def: mcq("Which structure controls what enters and leaves a cell?", "Cell membrane", "Cytoplasm", "Nucleolus", "Vacuole") },
  { topic: "Cell Biology", type: "true-false", difficulty: 1, def: { stem: "Plant cells have a cell wall; animal cells do not.", answer: true, penalty: 0 } },
  { topic: "Cell Biology", type: "dropdown", difficulty: 2, def: { stem: "Where does translation (protein synthesis) take place?", options: [{ id: "a", text: "Ribosome" }, { id: "b", text: "Nucleus" }, { id: "c", text: "Lysosome" }, { id: "d", text: "Centriole" }], answer: "a", shuffle: true } },
  { topic: "Cell Biology", type: "mcq", difficulty: 2, def: { stem: "Select every organelle found in plant cells but not animal cells.", options: [{ id: "a", text: "Chloroplast", correct: true }, { id: "b", text: "Central vacuole", correct: true }, { id: "c", text: "Mitochondrion", correct: false }, { id: "d", text: "Ribosome", correct: false }], multiple: true, shuffle: true, scoring: "right-minus-wrong", penalty: 0 } },
  { topic: "Cell Biology", type: "short-answer", difficulty: 3, def: { stem: "What is the name of the process by which a cell engulfs large particles?", match: { kind: "regex", pattern: "^phagocytosis$", caseSensitive: false, example: "phagocytosis" } } },

  { topic: "Genetics", type: "short-answer", difficulty: 1, def: { stem: "How many chromosomes are in a human somatic cell?", match: { kind: "numeric", value: 46, tolerance: {} } } },
  { topic: "Genetics", type: "mcq", difficulty: 1, def: mcq("Which molecule carries genetic information?", "DNA", "ATP", "Glucose", "Lipid") },
  { topic: "Genetics", type: "true-false", difficulty: 2, def: { stem: "A recessive allele is expressed when only one copy is present.", answer: false, penalty: 0 } },
  { topic: "Genetics", type: "mcq", difficulty: 2, def: mcq("A cross of two heterozygotes (Aa × Aa) gives what genotype ratio?", "1 AA : 2 Aa : 1 aa", "3 AA : 1 aa", "1 AA : 1 aa", "All Aa") },
  { topic: "Genetics", type: "short-answer", difficulty: 3, def: { stem: "In a Aa × Aa cross, what percentage of offspring show the recessive phenotype?", match: { kind: "numeric", value: 25, tolerance: {}, units: ["%"] } } },

  { topic: "Ecology", type: "mcq", difficulty: 1, def: mcq("What do we call an organism that makes its own food?", "Producer", "Consumer", "Decomposer", "Predator") },
  { topic: "Ecology", type: "true-false", difficulty: 1, def: { stem: "Energy is recycled through an ecosystem, while nutrients flow through it once.", answer: false, penalty: 0 } },
  { topic: "Ecology", type: "dropdown", difficulty: 2, def: { stem: "Roughly what percentage of energy passes from one trophic level to the next?", options: [{ id: "a", text: "10%" }, { id: "b", text: "50%" }, { id: "c", text: "90%" }, { id: "d", text: "100%" }], answer: "a", shuffle: false } },
  { topic: "Ecology", type: "short-answer", difficulty: 2, def: { stem: "Name the process by which plants convert light energy into chemical energy.", match: { kind: "text", accepted: ["photosynthesis"], caseSensitive: false, collapseWhitespace: true } } },
];
