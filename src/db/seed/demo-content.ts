// Demo question bank for BIO 101. Plain data; the seed turns it into
// topics, questions, versions and a draft exam.
import type { DropdownDef } from "@/question-types/dropdown/core";
import type { McqDef } from "@/question-types/mcq/core";
import type { ShortAnswerDef } from "@/question-types/short-answer/core";
import type { TrueFalseDef } from "@/question-types/true-false/core";

export const DEMO_TOPICS = ["Cell Biology", "Genetics", "Ecology", "Evolution"] as const;
export type DemoTopic = (typeof DEMO_TOPICS)[number];

interface DemoQuestion<T extends string = DemoTopic> {
  topic: T;
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
  { topic: "Cell Biology", type: "true-false", difficulty: 2, def: { stem: "Prokaryotic cells have a membrane-bound nucleus.", answer: false, penalty: 0 } },
  { topic: "Cell Biology", type: "mcq", difficulty: 2, def: mcq("Which organelle packages and ships proteins?", "Golgi apparatus", "Smooth ER", "Peroxisome", "Centrosome") },
  { topic: "Cell Biology", type: "dropdown", difficulty: 3, def: { stem: "Water moving across a membrane from low to high solute concentration is called…", options: [{ id: "a", text: "Osmosis" }, { id: "b", text: "Active transport" }, { id: "c", text: "Exocytosis" }, { id: "d", text: "Facilitated diffusion" }], answer: "a", shuffle: true } },

  { topic: "Genetics", type: "mcq", difficulty: 1, def: mcq("Which base pairs with adenine in DNA?", "Thymine", "Uracil", "Guanine", "Cytosine") },
  { topic: "Genetics", type: "true-false", difficulty: 1, def: { stem: "Genes are sections of DNA that code for proteins.", answer: true, penalty: 0 } },
  { topic: "Genetics", type: "mcq", difficulty: 3, def: mcq("Meiosis produces cells that are…", "Haploid and genetically different", "Diploid and identical", "Haploid and identical", "Diploid and genetically different") },

  { topic: "Ecology", type: "mcq", difficulty: 1, def: mcq("A group of the same species living in one area is a…", "Population", "Community", "Ecosystem", "Biome") },
  { topic: "Ecology", type: "mcq", difficulty: 2, def: mcq("Which relationship benefits both species?", "Mutualism", "Parasitism", "Commensalism", "Competition") },
  { topic: "Ecology", type: "short-answer", difficulty: 3, def: { stem: "What is the term for the maximum population an environment can sustain?", match: { kind: "text", accepted: ["carrying capacity"], caseSensitive: false, collapseWhitespace: true } } },

  { topic: "Evolution", type: "mcq", difficulty: 1, def: mcq("Who proposed evolution by natural selection alongside Wallace?", "Charles Darwin", "Gregor Mendel", "Louis Pasteur", "Carl Linnaeus") },
  { topic: "Evolution", type: "true-false", difficulty: 1, def: { stem: "Individuals evolve during their lifetime.", answer: false, penalty: 0 } },
  { topic: "Evolution", type: "mcq", difficulty: 2, def: mcq("Structures with a shared origin but different functions are…", "Homologous", "Analogous", "Vestigial", "Convergent") },
  { topic: "Evolution", type: "dropdown", difficulty: 2, def: { stem: "Random change in allele frequency in a small population is called…", options: [{ id: "a", text: "Genetic drift" }, { id: "b", text: "Gene flow" }, { id: "c", text: "Mutation" }, { id: "d", text: "Natural selection" }], answer: "a", shuffle: true } },
  { topic: "Evolution", type: "short-answer", difficulty: 3, def: { stem: "What is the formation of a new species called?", match: { kind: "text", accepted: ["speciation"], caseSensitive: false, collapseWhitespace: true } } },
  { topic: "Evolution", type: "true-false", difficulty: 2, def: { stem: "Antibiotic resistance in bacteria is an example of natural selection.", answer: true, penalty: 0 } },
];

/** A second course with its own teacher, to show that instructors only see what they teach. */
export const CHEM_TOPICS = ["Atoms", "Reactions"] as const;

export const CHEM_QUESTIONS: DemoQuestion<(typeof CHEM_TOPICS)[number]>[] = [
  { topic: "Atoms", type: "mcq", difficulty: 1, def: mcq("Which particle has a negative charge?", "Electron", "Proton", "Neutron", "Nucleus") },
  { topic: "Atoms", type: "short-answer", difficulty: 1, def: { stem: "What is the atomic number of carbon?", match: { kind: "numeric", value: 6, tolerance: {} } } },
  { topic: "Atoms", type: "true-false", difficulty: 2, def: { stem: "Isotopes of an element have different numbers of protons.", answer: false, penalty: 0 } },
  { topic: "Atoms", type: "mcq", difficulty: 2, def: mcq("Which group holds the noble gases?", "Group 18", "Group 1", "Group 2", "Group 17") },
  { topic: "Reactions", type: "mcq", difficulty: 1, def: mcq("What is produced when an acid reacts with a base?", "Salt and water", "Hydrogen only", "Oxygen and salt", "Carbon dioxide only") },
  { topic: "Reactions", type: "true-false", difficulty: 1, def: { stem: "Mass is conserved in a chemical reaction.", answer: true, penalty: 0 } },
  { topic: "Reactions", type: "dropdown", difficulty: 2, def: { stem: "A reaction that releases heat is…", options: [{ id: "a", text: "Exothermic" }, { id: "b", text: "Endothermic" }, { id: "c", text: "Catalytic" }, { id: "d", text: "Reversible" }], answer: "a", shuffle: true } },
  { topic: "Reactions", type: "short-answer", difficulty: 3, def: { stem: "What is the pH of a neutral solution at 25 °C?", match: { kind: "numeric", value: 7, tolerance: {} } } },
];
