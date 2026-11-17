import type { RubricCriterion } from "../grading/rubric";
import type { PreflightIssue } from "../types";
import type { AssignmentSettings } from "./settings";

/** Checked before publishing; blocking issues stop the publish. */
export function validateAssignment(a: {
  title: string;
  points: number;
  opensAt: Date | null;
  dueAt: Date | null;
  categoryId: string | null;
  /** The course's grade categories. */
  categoryIds: readonly string[];
  rubric: readonly RubricCriterion[];
  settings: AssignmentSettings;
}): PreflightIssue[] {
  const out: PreflightIssue[] = [];
  const block = (code: string, message: string, path?: string) => out.push({ severity: "blocking", code: `assignment.${code}`, message, path });
  const warn = (code: string, message: string, path?: string) => out.push({ severity: "warning", code: `assignment.${code}`, message, path });

  if (!a.title.trim()) block("no-title", "Give the assignment a title.", "title");
  if (!(a.points > 0)) block("no-points", "The assignment must be worth more than 0 points.", "points");
  if (a.opensAt && a.dueAt && a.dueAt <= a.opensAt) block("due-before-open", "The due date is before the assignment opens.", "dueAt");
  if (!a.settings.allowText && !a.settings.allowFiles) block("no-way-to-submit", "Students have no way to hand in: allow text, files, or both.", "settings");

  const seen = new Set<string>();
  a.rubric.forEach((c, i) => {
    if (seen.has(c.id)) block("rubric-duplicate", `Rubric line ${i + 1} repeats an id.`, `rubric[${i}]`);
    seen.add(c.id);
    if (!c.text.trim()) block("rubric-empty-text", `Rubric line ${i + 1} has no description.`, `rubric[${i}].text`);
    if (!(c.points > 0)) block("rubric-no-points", `Rubric line ${i + 1} is worth no points.`, `rubric[${i}].points`);
  });

  if (!a.dueAt) warn("no-due-date", "There is no due date, so it never closes and never shows on the calendar.", "dueAt");
  if (!a.categoryId) warn("no-category", "It isn't in a grade category, so it won't count towards the course grade.", "categoryId");
  else if (!a.categoryIds.includes(a.categoryId)) block("unknown-category", "Its grade category no longer exists.", "categoryId");
  if (a.rubric.length === 0) warn("no-rubric", "No rubric: each hand-in is marked with a single score.", "rubric");
  return out;
}
