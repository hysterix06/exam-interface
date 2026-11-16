// One question of every type the main bank doesn't use, so each one can be
// seen in a real attempt, on results and in item analysis. Plain data.

export const LAB_SKILLS = "Lab Skills";
export const LAB_REPORTS = "Lab Reports";
export const SHOWCASE_EXAM = "BIO 101 Lab Skills Check (open)";
export const REPORT_EXAM = "BIO 101 Lab Report (to mark)";

export interface ShowcaseQuestion {
  topic: typeof LAB_SKILLS | typeof LAB_REPORTS;
  type: string;
  difficulty: 1 | 2 | 3;
  points: number;
  def: unknown;
}

export const SHOWCASE_QUESTIONS: ShowcaseQuestion[] = [
  {
    topic: LAB_SKILLS,
    type: "ordering",
    difficulty: 1,
    points: 2,
    def: {
      stem: "Put the steps of preparing a wet-mount slide in order.",
      items: [
        { id: "a", text: "Place a drop of water on the slide" },
        { id: "b", text: "Add the specimen to the drop" },
        { id: "c", text: "Lower the cover slip at an angle" },
        { id: "d", text: "Start on the lowest-power objective" },
      ],
    },
  },
  {
    topic: LAB_SKILLS,
    type: "matching",
    difficulty: 1,
    points: 2,
    def: {
      stem: "Match each piece of equipment to what it is for.",
      pairs: [
        { id: "p", left: "Micropipette", right: "Measuring small volumes" },
        { id: "c", left: "Centrifuge", right: "Separating by density" },
        { id: "i", left: "Incubator", right: "Keeping cultures warm" },
      ],
      distractors: ["Sterilising glassware"],
    },
  },
  {
    topic: LAB_SKILLS,
    type: "cloze",
    difficulty: 2,
    points: 3,
    def: {
      template: "A light microscope with a {{num:10}}× eyepiece and a 40× objective magnifies {{num:400}} times. Stain cells with {{select:iodine*|salt water|vinegar}} to see starch, and record the {{text:control|control group}} result first.",
    },
  },
  {
    topic: LAB_SKILLS,
    type: "numeric",
    difficulty: 2,
    points: 2,
    def: {
      stem: "A culture starts with {n0} bacteria and doubles every {t} minutes. How many bacteria are there after {h} hours?",
      variables: [
        { kind: "int", name: "n0", min: 50, max: 400 },
        { kind: "pick", name: "t", options: ["20", "30"] },
        { kind: "int", name: "h", min: 1, max: 2 },
      ],
      constraints: [],
      answer: "n0 * 2 ^ (h * 60 / t)",
      tolerance: { rel: 0.001 },
    },
  },
  {
    topic: LAB_SKILLS,
    type: "table-fill",
    difficulty: 2,
    points: 3,
    def: {
      stem: "Complete the dilution table. Each tube is a 1 in 10 dilution of the one before.",
      columns: ["Tube", "Dilution", "Cells per mL"],
      rows: [
        ["1", "1:10", "100000"],
        ["2", "{{text:1:100|1/100}}", "{{num:10000}}"],
        ["3", "1:1000", "{{num:1000}}"],
      ],
    },
  },
  {
    topic: LAB_SKILLS,
    type: "spreadsheet",
    difficulty: 2,
    points: 2,
    def: {
      stem: "Total the colony counts in B5 using SUM, then work out the mean per plate in B6.",
      rows: 6,
      cols: 2,
      cells: { A1: "Plate 1", B1: "34", A2: "Plate 2", B2: "41", A3: "Plate 3", B3: "29", A4: "Plate 4", B4: "36", A5: "Total", A6: "Mean" },
      inputs: ["B5", "B6"],
      solution: { B5: "=SUM(B1:B4)", B6: "=B5/4" },
      checks: [
        { id: "total", cell: "B5", label: "Total colonies", requireFormula: true, functions: ["SUM"] },
        { id: "mean", cell: "B6", label: "Mean per plate", abs: 0.01, requireFormula: true },
      ],
    },
  },
  {
    topic: LAB_SKILLS,
    type: "widget",
    difficulty: 1,
    points: 3,
    def: {
      stem: "The department café till is below. Ring up 2 Coffees and 1 Croissant for the lab meeting, apply the 10% staff discount, and leave the order on screen.",
      widget: "pos-demo",
      config: { menu: [{ name: "Coffee", price: 3 }, { name: "Croissant", price: 4 }, { name: "Juice", price: 5 }], discounts: [0, 10, 20] },
      checks: [
        { kind: "number", id: "total", label: "Order total", path: "total", expected: 9, abs: 0.01 },
        { kind: "number", id: "lines", label: "Lines on the order", path: "order.length", expected: 2, abs: 0 },
        { kind: "number", id: "disc", label: "Discount applied (%)", path: "discountPct", expected: 10, abs: 0 },
      ],
      solution: { order: [{ name: "Coffee", qty: 2, price: 3 }, { name: "Croissant", qty: 1, price: 4 }], discountPct: 10, total: 9 },
    },
  },
  {
    topic: LAB_REPORTS,
    type: "long-answer",
    difficulty: 3,
    points: 4,
    def: {
      stem: "You tested whether temperature changes how fast yeast respires. Write the method section of your lab report.",
      rubric: [
        { id: "v", text: "Names the independent and dependent variables", points: 1 },
        { id: "c", text: "Says what was kept the same (controlled)", points: 1 },
        { id: "r", text: "Describes repeats or a control", points: 1 },
        { id: "m", text: "Says how CO2 (or bubbles) was measured", points: 1 },
      ],
      maxWords: 250,
      keywords: ["temperature", "control", "repeat", "CO2", "bubbles"],
    },
  },
];

/** What six demo students wrote for the lab report, from strong to weak, for the marking queue. */
export const REPORT_ANSWERS = [
  "We changed the temperature of the water bath (20, 30, 40 and 50 °C); that was the independent variable. The dependent variable was the rate of CO2 production, measured by counting bubbles per minute in the delivery tube. We kept the mass of yeast, the volume and concentration of the sugar solution, and the timing the same. Each temperature was repeated three times and we ran a control tube with no yeast.",
  "Temperature was the thing we changed and we measured how many bubbles came off each minute. The amount of yeast and sugar stayed the same each time. We repeated each one twice to check.",
  "We put yeast and sugar in tubes at different temperatures and counted the bubbles. The hottest one made the most bubbles until it got too hot.",
  "Yeast respires and makes CO2. We used a water bath. We kept everything the same except the temperature, and used a control with boiled yeast.",
  "We did the experiment with yeast and watched what happened at different temperatures.",
  "I wasn't in this lab.",
];
