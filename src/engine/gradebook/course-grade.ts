import { fmtNum, roundScore } from "../grading/format";
import type { Explanation } from "../types";

// The course grade, worked out the way a syllabus describes it, with every
// step written down so a student or educator can check it by hand:
//   1. inside a category, points earned ÷ points available (after dropping
//      the lowest N by percentage),
//   2. categories combined by their weights,
//   3. categories with nothing graded yet are left out and the remaining
//      weights are scaled up to 100%.
// The server decides what "graded" means for a viewer (released results only
// for students); this only does the arithmetic.

export interface GradeCategoryInput {
  id: string;
  name: string;
  /** Percent of the course grade (relative; need not add to 100). */
  weight: number;
  dropLowest: number;
}

export interface GradebookItem {
  id: string;
  title: string;
  kind: "exam" | "assignment";
  categoryId: string | null;
  /** Points earned, or null when there is nothing to count yet. */
  score: number | null;
  max: number;
  excused?: boolean;
}

export interface CategoryGrade {
  id: string;
  name: string;
  weight: number;
  dropLowest: number;
  /** Share of the course grade after scaling (0 when left out). */
  effectiveWeight: number;
  /** Percent in this category, or null when nothing is graded. */
  percent: number | null;
  earned: number;
  max: number;
  counted: string[];
  dropped: string[];
  pending: number;
  excused: number;
}

export interface CourseGrade {
  percent: number | null;
  categories: CategoryGrade[];
  /** Items that belong to no category and so don't count. */
  uncounted: string[];
  /** The working, in reading order. */
  lines: string[];
}

const pct = (n: number) => `${fmtNum(Math.round(n * 10) / 10)}%`;
const ratio = (i: GradebookItem) => (i.score ?? 0) / i.max;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function categoryGrade(c: GradeCategoryInput, items: GradebookItem[]): CategoryGrade {
  const scored = items.filter((i) => i.score !== null && !i.excused && i.max > 0);
  const drop = Math.min(Math.max(0, Math.floor(c.dropLowest)), Math.max(0, scored.length - 1));
  const ordered = [...scored].sort((a, b) => ratio(a) - ratio(b) || a.id.localeCompare(b.id));
  const dropped = ordered.slice(0, drop);
  const kept = scored.filter((i) => !dropped.includes(i));
  const earned = roundScore(kept.reduce((s, i) => s + (i.score ?? 0), 0));
  const max = roundScore(kept.reduce((s, i) => s + i.max, 0));
  return {
    id: c.id,
    name: c.name,
    weight: c.weight,
    dropLowest: c.dropLowest,
    effectiveWeight: 0,
    percent: max > 0 ? roundScore((earned / max) * 100) : null,
    earned,
    max,
    counted: kept.map((i) => i.id),
    dropped: dropped.map((i) => i.id),
    pending: items.filter((i) => i.score === null && !i.excused).length,
    excused: items.filter((i) => i.excused).length,
  };
}

function byPoints(items: GradebookItem[]): CourseGrade {
  const scored = items.filter((i) => i.score !== null && !i.excused && i.max > 0);
  const earned = roundScore(scored.reduce((s, i) => s + (i.score ?? 0), 0));
  const max = roundScore(scored.reduce((s, i) => s + i.max, 0));
  const percent = max > 0 ? roundScore((earned / max) * 100) : null;
  return {
    percent,
    categories: [],
    uncounted: [],
    lines: [
      "No weights are set for this course, so every graded item counts by its points.",
      percent === null ? "No course grade yet: nothing has been graded." : `Course grade: ${fmtNum(earned)} of ${fmtNum(max)} points = ${pct(percent)}.`,
    ],
  };
}

export function courseGrade(categories: readonly GradeCategoryInput[], items: readonly GradebookItem[]): CourseGrade {
  if (categories.length === 0) return byPoints([...items]);

  const ids = new Set(categories.map((c) => c.id));
  const uncounted = items.filter((i) => !i.categoryId || !ids.has(i.categoryId)).map((i) => i.id);
  const grades = categories.map((c) => categoryGrade(c, items.filter((i) => i.categoryId === c.id)));
  const titles = new Map(items.map((i) => [i.id, i.title]));

  const active = grades.filter((g) => g.percent !== null && g.weight > 0);
  const totalWeight = active.reduce((s, g) => s + g.weight, 0);
  for (const g of active) g.effectiveWeight = roundScore((g.weight / totalWeight) * 100);

  const lines: string[] = [];
  for (const g of grades) {
    const head = `${g.name} (${fmtNum(g.weight)}%)`;
    const extras = [
      g.dropped.length ? `dropped the lowest ${plural(g.dropped.length, "item")}: ${g.dropped.map((d) => titles.get(d)).join(", ")}` : "",
      g.excused ? `${plural(g.excused, "item")} excused` : "",
      g.pending ? `${plural(g.pending, "item")} not graded yet` : "",
    ].filter(Boolean);
    const tail = extras.length ? ` (${extras.join("; ")})` : "";
    if (g.percent === null) lines.push(`${head}: nothing graded yet, so it is left out${tail}.`);
    else lines.push(`${head}: ${fmtNum(g.earned)} of ${fmtNum(g.max)} points = ${pct(g.percent)}${tail}.`);
  }
  if (uncounted.length) lines.push(`${plural(uncounted.length, "item")} not in any category, so not counted.`);

  if (active.length === 0 || totalWeight <= 0) {
    lines.push("No course grade yet: nothing has been graded.");
    return { percent: null, categories: grades, uncounted, lines };
  }

  const percent = roundScore(active.reduce((s, g) => s + (g.percent ?? 0) * g.weight, 0) / totalWeight);
  const allWeight = grades.reduce((s, g) => s + Math.max(0, g.weight), 0);
  if (totalWeight !== allWeight) {
    lines.push(`Only ${fmtNum(totalWeight)}% of the weight has graded work, so those weights are scaled to 100%.`);
  }
  const working = active.map((g) => `${pct(g.percent ?? 0)} × ${fmtNum(Math.round(g.effectiveWeight * 10) / 10)}%`).join(" + ");
  lines.push(`Course grade: ${active.length > 1 ? `${working} = ` : ""}${pct(percent)}.`);
  return { percent, categories: grades, uncounted, lines };
}

/** The same working as an Explanation, for the clickable number. */
export function courseGradeExplanation(g: CourseGrade): Explanation {
  const counted = g.categories.filter((c) => c.percent !== null && c.effectiveWeight > 0);
  return {
    formula: g.categories.length
      ? "In each category, points earned ÷ points available; then each category counts by its weight. Categories with nothing graded yet are left out and the others scaled up."
      : "Points earned ÷ points available, over everything graded so far.",
    inputs: counted.map((c) => ({ label: `${c.name} (${fmtNum(c.weight)}%)`, value: `${pct(c.percent ?? 0)} of ${fmtNum(Math.round(c.effectiveWeight * 10) / 10)}%` })),
    note: g.lines.at(-1),
  };
}
