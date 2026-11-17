// The second showcase bank: one question of every type added after the first
// (and of the newer features: drag-in chips, significant figures, wording
// variants). Seeded once, keyed on the "Field Skills" topic. Plain data.
import type { ShowcaseQuestion } from "./showcase-content";

export const FIELD_SKILLS = "Field Skills";
export const FIELD_EXAM = "BIO 101 Field Skills Check (open)";

/** Seed images, drawn by src/db/seed/images.ts and uploaded per course; questions refer to them as "seed:<name>". */
export const SEED_IMAGE_PREFIX = "seed:";
const seedImage = (name: string, alt: string) => ({ assetId: `${SEED_IMAGE_PREFIX}${name}`, width: 800, height: 600, alt });

export interface FieldQuestion extends Omit<ShowcaseQuestion, "topic"> {
  topic: typeof FIELD_SKILLS;
}

export const FIELD_QUESTIONS: FieldQuestion[] = [
  {
    topic: FIELD_SKILLS,
    type: "categorization",
    difficulty: 1,
    points: 3,
    def: {
      stem: "Sort each organism from the pond sample into its kingdom.",
      categories: [
        { id: "animal", name: "Animals" },
        { id: "plant", name: "Plants" },
        { id: "fungus", name: "Fungi" },
      ],
      items: [
        { id: "a", text: "Water flea", category: "animal" },
        { id: "b", text: "Duckweed", category: "plant" },
        { id: "c", text: "Water mould", category: "fungus" },
        { id: "d", text: "Pond snail", category: "animal" },
        { id: "e", text: "Hornwort", category: "plant" },
        { id: "f", text: "Bracket fungus on a log", category: "fungus" },
      ],
      penalty: 0,
    },
  },
  {
    topic: FIELD_SKILLS,
    type: "cloze",
    difficulty: 1,
    points: 2,
    def: {
      template: "Plants capture light energy by {{chip:photosynthesis}} and release it again by {{chip:respiration}}.",
      extraChips: ["digestion", "transpiration"],
    },
  },
  {
    topic: FIELD_SKILLS,
    type: "numeric",
    difficulty: 2,
    points: 4,
    def: {
      stem: "[[student]] counts {n} snails in a {a} m² quadrat. What is the density, in snails per m²? Give **3 significant figures**.",
      variables: [
        { kind: "int", name: "n", min: 7, max: 40 },
        { kind: "float", name: "a", min: 0.25, max: 4, decimals: 2 },
      ],
      constraints: [],
      answer: "n / a",
      tolerance: {},
      sigFigs: { count: 3, weight: 0.25 },
      textVars: { table: [{ student: "Ana" }, { student: "Kofi" }, { student: "Mei" }, { student: "Tomás" }], lists: [] },
    },
  },
  {
    topic: FIELD_SKILLS,
    type: "hotspot",
    difficulty: 1,
    points: 2,
    def: {
      stem: "Click the **nucleus** of this animal cell.",
      image: seedImage("cell", "Diagram of an animal cell: a large outer membrane, a round nucleus in the middle and two small oval mitochondria"),
      regions: [
        { id: "n", label: "Nucleus", shape: { kind: "circle", cx: 0.5, cy: 0.5, r: 0.14 }, correct: true },
        { id: "m1", label: "Mitochondrion (left)", shape: { kind: "rect", x: 0.2, y: 0.28, w: 0.14, h: 0.1 }, correct: false },
        { id: "m2", label: "Mitochondrion (right)", shape: { kind: "rect", x: 0.64, y: 0.64, w: 0.14, h: 0.1 }, correct: false },
      ],
      multiple: false,
      penalty: 0,
    },
  },
  {
    topic: FIELD_SKILLS,
    type: "label-diagram",
    difficulty: 2,
    points: 3,
    def: {
      stem: "Drag each label to the numbered part of the cell. One label doesn't belong.",
      image: seedImage("cell", "Diagram of an animal cell: a large outer membrane, a round nucleus in the middle and two small oval mitochondria"),
      pins: [
        { id: "p1", x: 0.5, y: 0.5, labelId: "nucleus" },
        { id: "p2", x: 0.27, y: 0.33, labelId: "mito" },
        { id: "p3", x: 0.5, y: 0.12, labelId: "membrane" },
      ],
      labels: [
        { id: "nucleus", text: "Nucleus" },
        { id: "mito", text: "Mitochondrion" },
        { id: "membrane", text: "Cell membrane" },
        { id: "wall", text: "Cell wall" },
      ],
      penalty: 0,
    },
  },
  {
    topic: FIELD_SKILLS,
    type: "whiteboard",
    difficulty: 2,
    points: 3,
    def: {
      stem: "On the axes, sketch how the rate of an enzyme reaction changes with temperature. Mark the optimum.",
      background: seedImage("axes", "Empty graph axes: temperature in °C across the bottom, rate of reaction up the side"),
      rubric: [
        { id: "rise", text: "Rate rises with temperature at first", points: 1 },
        { id: "peak", text: "A clear optimum, marked", points: 1 },
        { id: "fall", text: "A steep fall after the optimum (the enzyme denatures)", points: 1 },
      ],
    },
  },
  {
    topic: FIELD_SKILLS,
    type: "file-task",
    difficulty: 2,
    points: 4,
    def: {
      stem: "Download **field-counts.xlsx**. In B8 total the snails with a formula using SUM, and in B9 work out the mean per quadrat with AVERAGE. Save and upload the workbook.",
      starter: { assetId: `${SEED_IMAGE_PREFIX}field-counts`, fileName: "field-counts.xlsx" },
      sheetName: "",
      rows: 10,
      cols: 3,
      solution: { A1: "Quadrat", B1: "Snails", A2: "1", B2: "12", A3: "2", B3: "7", A4: "3", B4: "15", A5: "4", B5: "9", A6: "5", B6: "11", A8: "Total", B8: "=SUM(B2:B6)", A9: "Mean", B9: "=AVERAGE(B2:B6)" },
      checks: [
        { id: "t", cell: "B8", label: "Total snails", functions: ["SUM"], requireFormula: true },
        { id: "m", cell: "B9", label: "Mean per quadrat", abs: 0.01, functions: ["AVERAGE"], requireFormula: true },
      ],
    },
  },
  {
    topic: FIELD_SKILLS,
    type: "widget",
    difficulty: 2,
    points: 3,
    def: {
      stem: "Use the front desk to check **Ms Okafor** in: give her a clean double room for the nights she booked, then add one breakfast and the parking charge to her folio.",
      widget: "pms-demo",
      config: {
        booking: { guest: "Ms Okafor", roomType: "Double", nights: 3, note: "Arriving by car." },
        rooms: [
          { number: "101", type: "Single", status: "clean", rate: 80 },
          { number: "204", type: "Double", status: "dirty", rate: 120 },
          { number: "206", type: "Double", status: "clean", rate: 120 },
          { number: "301", type: "Suite", status: "clean", rate: 210 },
        ],
        extras: [
          { name: "Breakfast", price: 14 },
          { name: "Parking", price: 18 },
          { name: "Late checkout", price: 25 },
        ],
      },
      checks: [
        { kind: "text", id: "type", label: "A double room", path: "roomType", expected: "Double" },
        { kind: "number", id: "nights", label: "The nights booked", path: "nights", expected: 3, abs: 0 },
        { kind: "number", id: "bal", label: "Folio balance", path: "total", expected: 392, abs: 0.01 },
      ],
      solution: { room: "206", roomType: "Double", nights: 3, checkedIn: true, folio: [{ item: "Breakfast", amount: 14 }, { item: "Parking", amount: 18 }], roomCharge: 360, total: 392 },
    },
  },
  {
    topic: FIELD_SKILLS,
    type: "code",
    difficulty: 3,
    points: 4,
    def: {
      stem: "Write `density(counts, area)` that returns the mean number of organisms per m² across the quadrats, rounded to 2 decimal places. `counts` is an array of counts; `area` is the area of one quadrat in m².",
      language: "javascript",
      starter: "function density(counts, area) {\n  // your code\n}\n",
      solution: "function density(counts, area) {\n  if (counts.length === 0) return 0;\n  const mean = counts.reduce((s, c) => s + c, 0) / counts.length;\n  return Math.round((mean / area) * 100) / 100;\n}\n",
      tests: [
        { id: "a", label: "Five quadrats of 1 m²", call: "density([12, 7, 15, 9, 11], 1)", expected: "10.8", hidden: false },
        { id: "b", label: "Half-metre quadrats", call: "density([3, 5], 0.5)", expected: "8", hidden: false },
        { id: "c", label: "No quadrats", call: "density([], 1)", expected: "0", hidden: true },
        { id: "d", label: "Rounding", call: "density([1, 2, 2], 3)", expected: "0.56", hidden: true },
      ],
      stepLimit: 2000,
    },
  },
  {
    topic: FIELD_SKILLS,
    type: "composite",
    difficulty: 2,
    points: 6,
    def: {
      stem: "Read the survey results, then answer each part.",
      stimulus:
        "Two ponds were surveyed with five quadrats each (1 m²).\n\n| Pond | Snails counted | Mean per m² |\n|---|---|---|\n| North | 60 | 12 |\n| South | 15 | 3 |\n\nThe South pond is next to a field sprayed with fertiliser.",
      shuffleParts: false,
      parts: [
        {
          id: "p1",
          type: "mcq",
          label: "Reading the table",
          weight: 1,
          def: {
            stem: "Which pond had more snails per m²?",
            options: [
              { id: "n", text: "North", correct: true },
              { id: "s", text: "South", correct: false },
            ],
            multiple: false,
            shuffle: true,
            scoring: "all-or-nothing",
            penalty: 0,
          },
        },
        { id: "p2", type: "cloze", label: "Comparing", weight: 1, def: { template: "North has {{num:4}} times as many snails per m² as South." } },
        {
          id: "p3",
          type: "long-answer",
          label: "Explaining",
          weight: 2,
          def: {
            stem: "Suggest one reason for the difference and how you would test it.",
            rubric: [
              { id: "r", text: "A plausible cause (e.g. fertiliser run-off, algal bloom, low oxygen)", points: 1 },
              { id: "t", text: "A fair test that changes one variable", points: 1 },
            ],
            maxWords: 120,
            keywords: ["fertiliser", "oxygen", "control"],
          },
        },
      ],
    },
  },
];
