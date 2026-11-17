// Course homepages, weights, calendar and assignments for the demo courses.
// Pure data (checked by academics-content.test.ts); dates are offsets in days
// from the week the seed runs, so the demo always has something due soon.
import type { AssignmentSettings } from "@/engine/assignments/settings";
import type { CourseInfo } from "@/engine/course";
import type { RubricCriterion } from "@/engine/grading/rubric";

export interface DemoCourse {
  code: string;
  term: string;
  /** Weeks before and after the seed's week. */
  weeksBefore: number;
  weeksAfter: number;
  description: string;
  syllabus: string;
  info: CourseInfo;
  categories: { name: string; weight: number; dropLowest: number }[];
  /** Exam title → category name. */
  examCategories: Record<string, string>;
  /** Weekly classes: weekday (0 = Monday), UTC start hour, minutes, title, where. */
  classes: { weekday: number; hour: number; minutes: number; title: string; location: string }[];
  /** One-off events, in days from Monday of the seed week. */
  events: { title: string; kind: "holiday" | "deadline" | "other"; day: number; description?: string }[];
  assignments: DemoAssignment[];
}

export interface DemoAssignment {
  title: string;
  category: string;
  instructions: string;
  points: number;
  /** Days from now; negative is in the past. */
  opensInDays: number;
  dueInDays: number;
  settings: Partial<AssignmentSettings>;
  rubric: RubricCriterion[];
  /** What happens in the demo: graded and released, waiting to be marked, or not handed in yet. */
  demo: "released" | "to-mark" | "open";
  /** Sample text answers, used round-robin. */
  answers: string[];
}

export const BIO: DemoCourse = {
  code: "BIO 101",
  term: "Autumn 2026",
  weeksBefore: 6,
  weeksAfter: 8,
  description: "How living things are built and how they work, from the cell to the ecosystem. Two lectures a week and a fortnightly lab.",
  syllabus: `## What you'll learn

By the end of the course you can:

1. Describe the structure of prokaryotic and eukaryotic cells and what each organelle does.
2. Explain diffusion and osmosis, and predict which way water moves.
3. Read and draw what you see under a light microscope, to scale.
4. Plan a simple experiment and write it up as a lab report.

## How the course runs

- **Lectures** on Mondays and Wednesdays. Slides go up the evening before.
- **Labs** every other Friday; bring your lab book.
- **Quizzes** open for a few days at a time and take about 15 minutes.

## Assessment

Your grade comes from the categories below (see *How your grade is worked out*). The lowest quiz is dropped, so one bad day doesn't count against you.

Late work loses 10% per day, for up to five days, unless you have an extension. If something gets in the way, **email before the deadline**: extensions are easy to give in advance and hard to give afterwards.

## Reading

*Campbell Biology*, chapters 6–8 and 36. Any recent edition is fine.

## Integrity

Work you hand in must be your own. Discussing ideas is encouraged; copying text or data is not. Quizzes are open-book but closed-friend.`,
  info: {
    meetings: [
      { days: "Mon, Wed", start: "10:00", end: "11:15", location: "Science Building 204" },
      { days: "Fri (every other week)", start: "14:00", end: "16:00", location: "Teaching Lab 3" },
    ],
    officeHours: "Tuesdays 14:00–16:00, Science Building 3.12, or by appointment.",
    contactNote: "Email is best. I reply within two working days; put “BIO 101” in the subject.",
    links: [{ label: "Lab safety rules", url: "https://example.com/bio101/lab-safety" }],
  },
  categories: [
    { name: "Exams", weight: 50, dropLowest: 0 },
    { name: "Quizzes", weight: 20, dropLowest: 1 },
    { name: "Homework", weight: 30, dropLowest: 0 },
  ],
  examCategories: {
    "BIO 101 Midterm (demo)": "Exams",
    "BIO 101 Practice (results)": "Exams",
    "BIO 101 Lab Report (to mark)": "Homework",
    "BIO 101 Quiz (open)": "Quizzes",
    "BIO 101 Lab Skills Check (open)": "Quizzes",
    "BIO 101 Field Skills Check (open)": "Quizzes",
  },
  classes: [
    { weekday: 0, hour: 9, minutes: 75, title: "Lecture", location: "Science Building 204" },
    { weekday: 2, hour: 9, minutes: 75, title: "Lecture", location: "Science Building 204" },
  ],
  events: [
    { title: "Lab: osmosis in potato cores", kind: "other", day: 4, description: "Bring your lab book. Goggles provided." },
    { title: "Reading week: no classes", kind: "holiday", day: 21 },
    { title: "Lab: microscopy", kind: "other", day: -10 },
  ],
  assignments: [
    {
      title: "Cell structure worksheet",
      category: "Homework",
      instructions: "Label the diagram of an animal cell and a plant cell, then say in one sentence what each organelle does.\n\nHand in a photo or PDF of your worksheet, or type your answers.",
      points: 10,
      opensInDays: -20,
      dueInDays: -9,
      settings: { allowText: true, allowFiles: true, maxFiles: 2, late: { mode: "accept", penaltyPercentPerDay: 10, maxPenaltyPercent: 50, closesAfterDays: 5 } },
      rubric: [
        { id: "labels", text: "Organelles labelled correctly", points: 4 },
        { id: "functions", text: "Each function stated accurately", points: 4 },
        { id: "compare", text: "Plant vs animal differences noted", points: 2 },
      ],
      demo: "released",
      answers: [
        "Nucleus: holds the DNA. Mitochondria: release energy in respiration. Chloroplast (plant only): photosynthesis. Cell wall (plant only): support.",
        "Ribosomes make proteins; the cell membrane controls what goes in and out; the vacuole stores sap and keeps the cell firm.",
        "Animal cells have no wall or chloroplasts. Both have a nucleus, cytoplasm, membrane and mitochondria.",
      ],
    },
    {
      title: "Microscopy drawing",
      category: "Homework",
      instructions: "Draw three onion epidermis cells as seen at ×400, with a scale bar and labels. Then work out the actual length of one cell and show your working.",
      points: 12,
      opensInDays: -12,
      dueInDays: -2,
      settings: { allowText: true, allowFiles: true, maxFiles: 3, late: { mode: "accept", penaltyPercentPerDay: 10, maxPenaltyPercent: 50, closesAfterDays: 5 } },
      rubric: [
        { id: "drawing", text: "Clear outline drawing, no shading", points: 3 },
        { id: "labels", text: "Labelled (wall, nucleus, cytoplasm)", points: 2 },
        { id: "scale", text: "Scale bar present and correct", points: 3 },
        { id: "calc", text: "Actual size worked out correctly", points: 4 },
      ],
      demo: "to-mark",
      answers: [
        "Image length 40 mm at ×400, so actual length = 40 / 400 = 0.1 mm = 100 µm. Drawing attached.",
        "The cells were roughly rectangular. Actual size = image size ÷ magnification = 36 mm ÷ 400 = 0.09 mm.",
        "I measured 45 mm, divided by 400 to get 0.1125 mm.",
      ],
    },
    {
      title: "Osmosis lab report",
      category: "Homework",
      instructions:
        "Write up Friday's potato-core lab as a short report:\n\n1. **Hypothesis**: what you expected and why.\n2. **Method**: enough that someone else could repeat it.\n3. **Results**: a table and a graph of % change in mass against sucrose concentration.\n4. **Discussion**: where the line crosses zero, and what that tells you.\n\nAbout 600 words. PDF or Word.",
      points: 20,
      opensInDays: -1,
      dueInDays: 3,
      settings: { allowText: false, allowFiles: true, maxFiles: 2, accept: ["pdf", "docx"], late: { mode: "accept", penaltyPercentPerDay: 10, maxPenaltyPercent: 50, closesAfterDays: 5 } },
      rubric: [
        { id: "hyp", text: "Testable hypothesis with a reason", points: 2 },
        { id: "method", text: "Method could be repeated", points: 3 },
        { id: "results", text: "Clear table and correctly plotted graph", points: 5 },
        { id: "discussion", text: "Finds and explains the isotonic point", points: 7 },
        { id: "writing", text: "Clear, concise writing", points: 3 },
      ],
      demo: "open",
      answers: [],
    },
  ],
};

export const CHEM: DemoCourse = {
  code: "CHEM 101",
  term: "Autumn 2026",
  weeksBefore: 6,
  weeksAfter: 8,
  description: "Atoms, bonding, reactions and the quantities chemists measure them with.",
  syllabus: `## What you'll learn

- Write and balance equations, and use moles to work out masses and concentrations.
- Explain ionic, covalent and metallic bonding.
- Carry out a titration and analyse the results.

## Assessment

Exams count for 60% and lab reports for 40%. Lab reports are marked against the rubric shown on each one.

## Labs

Lab coats and goggles are required. If you miss a lab, talk to me about a catch-up session.`,
  info: {
    meetings: [{ days: "Tue, Thu", start: "13:00", end: "14:15", location: "Chemistry 101" }],
    officeHours: "Thursdays 15:00–17:00, Chemistry 2.04.",
    contactNote: "Email me; for anything urgent, come to office hours.",
    links: [],
  },
  categories: [
    { name: "Exams", weight: 60, dropLowest: 0 },
    { name: "Labs", weight: 40, dropLowest: 0 },
  ],
  examCategories: {},
  classes: [
    { weekday: 1, hour: 12, minutes: 75, title: "Lecture", location: "Chemistry 101" },
    { weekday: 3, hour: 12, minutes: 75, title: "Lecture", location: "Chemistry 101" },
  ],
  events: [{ title: "Lab: acid–base titration", kind: "other", day: 3 }],
  assignments: [
    {
      title: "Titration lab report",
      category: "Labs",
      instructions: "Report your titre values, the mean of your concordant results, and the concentration of the unknown acid. Show every step of the calculation.",
      points: 15,
      opensInDays: -1,
      dueInDays: 6,
      settings: { allowText: true, allowFiles: true, maxFiles: 2, accept: ["pdf", "docx", "workbook", "image"], late: { mode: "reject" } },
      rubric: [
        { id: "titres", text: "Titres recorded to 0.05 cm³", points: 2 },
        { id: "concordant", text: "Concordant results chosen and averaged", points: 3 },
        { id: "moles", text: "Moles of base worked out", points: 4 },
        { id: "conc", text: "Concentration of acid correct, with units", points: 6 },
      ],
      demo: "open",
      answers: [],
    },
  ],
};
