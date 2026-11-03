import { fmtNum } from "../grading/format";
import type { PreflightIssue } from "../types";
import type { Blueprint, PoolItem } from "./types";

export type Names = Record<string, string>;

const nameOf = (names: Names, id: string) => names[id] ?? id;

/** Questions in a set that can coexist: each variant group counts once. */
function distinctDrawable(items: readonly PoolItem[]) {
  const groups = new Set<string>();
  let loose = 0;
  for (const q of items) {
    if (q.groupKey) groups.add(q.groupKey);
    else loose++;
  }
  return loose + groups.size;
}

/**
 * Pre-flight for a blueprint against its pool. Blocking issues mean some
 * students could not get a complete exam. Messages are written for educators.
 */
export function checkBlueprint(
  blueprint: Blueprint,
  pool: readonly PoolItem[],
  topicNames: Names = {},
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  if (blueprint.sections.length === 0) {
    issues.push({ severity: "blocking", code: "blueprint.empty", message: "The exam has no sections yet." });
  }

  const seenTopics = new Set<string>();
  let minTotal = 0;
  let maxTotal = 0;

  blueprint.sections.forEach((section, i) => {
    const topic = nameOf(topicNames, section.topicId);
    const path = `sections[${i}]`;
    const all = pool.filter((q) => q.topicId === section.topicId);
    const drawable = all.filter((q) => q.weight > 0);

    if (seenTopics.has(section.topicId)) {
      issues.push({
        severity: "warning",
        code: "blueprint.duplicate-topic",
        message: `${topic} appears in more than one section; consider merging them.`,
        path,
      });
    }
    seenTopics.add(section.topicId);

    const neverDrawn = all.length - drawable.length;
    if (neverDrawn > 0) {
      issues.push({
        severity: "warning",
        code: "blueprint.zero-weight",
        message: `${neverDrawn} question(s) in ${topic} have weight 0 and will never be drawn.`,
        path,
      });
    }

    if (drawable.length < section.count) {
      issues.push({
        severity: "blocking",
        code: "blueprint.pool-too-small",
        message: `${topic} has ${drawable.length} question(s) but ${section.count} are requested.`,
        path,
      });
    } else if (distinctDrawable(drawable) < section.count) {
      issues.push({
        severity: "blocking",
        code: "blueprint.groups-too-small",
        message: `${topic} has ${drawable.length} questions, but variant groups leave only ${distinctDrawable(drawable)} that can appear together; ${section.count} are requested.`,
        path,
      });
    }

    if (section.difficultyMix) {
      const mixTotal = Object.values(section.difficultyMix).reduce((s, n) => s + n, 0);
      if (mixTotal !== section.count) {
        issues.push({
          severity: "blocking",
          code: "blueprint.mix-mismatch",
          message: `The difficulty mix for ${topic} adds up to ${mixTotal}, but the section asks for ${section.count}.`,
          path: `${path}.difficultyMix`,
        });
      }
      for (const [level, count] of Object.entries(section.difficultyMix)) {
        const atLevel = drawable.filter((q) => q.difficulty === Number(level));
        if (count > 0 && distinctDrawable(atLevel) < count) {
          issues.push({
            severity: "blocking",
            code: "blueprint.difficulty-too-small",
            message: `${topic} needs ${count} question(s) at difficulty ${level} but has ${atLevel.length}.`,
            path: `${path}.difficultyMix.${level}`,
          });
        }
      }
    }

    // Range of possible point totals for this section.
    const pts = drawable.map((q) => q.points).sort((a, b) => a - b);
    if (pts.length >= section.count) {
      minTotal += pts.slice(0, section.count).reduce((s, p) => s + p, 0);
      maxTotal += pts.slice(-section.count).reduce((s, p) => s + p, 0);
    }
  });

  if (minTotal !== maxTotal) {
    issues.push({
      severity: "warning",
      code: "blueprint.unequal-totals",
      message: `Questions in the same section are worth different points, so students may get different totals (${fmtNum(minTotal)}–${fmtNum(maxTotal)} points).`,
    });
  }

  const hasConflicts = pool.some((q) => (q.conflictsWith?.length ?? 0) > 0);
  if (hasConflicts && !issues.some((i) => i.severity === "blocking")) {
    issues.push({
      severity: "warning",
      code: "blueprint.conflicts-unverified",
      message: "Some questions can't appear together. Run a simulation to confirm every student still gets a full exam.",
    });
  }

  return issues;
}
