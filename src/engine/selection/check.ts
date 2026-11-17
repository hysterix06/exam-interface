import { fmtNum } from "../grading/format";
import type { PreflightIssue } from "../types";
import { type Blueprint, type PoolItem, sectionTopics } from "./types";

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
    const ids = sectionTopics(section);
    const topic = ids.map((t) => nameOf(topicNames, t)).join(" or ");
    const path = `sections[${i}]`;
    const all = pool.filter((q) => ids.includes(q.topicId));
    const drawable = all.filter((q) => q.weight > 0);

    for (const t of ids) {
      if (seenTopics.has(t)) {
        issues.push({
          severity: "warning",
          code: "blueprint.duplicate-topic",
          message: `${nameOf(topicNames, t)} appears in more than one section; consider merging them.`,
          path,
        });
      }
      seenTopics.add(t);
    }

    if (section.limits) issues.push(...checkLimits(section.limits, ids, section.count, drawable, topicNames, path));

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

/** Can the section's per-topic minimums and maximums all be met at once? */
function checkLimits(
  limits: Record<string, { min?: number; max?: number }>,
  topics: string[],
  count: number,
  drawable: readonly PoolItem[],
  topicNames: Names,
  path: string,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const block = (code: string, message: string) => issues.push({ severity: "blocking", code, message, path: `${path}.limits` });
  let minSum = 0;
  let maxSum = 0;
  for (const [t, l] of Object.entries(limits)) {
    const name = nameOf(topicNames, t);
    if (!topics.includes(t)) {
      block("blueprint.limit-unknown-topic", `A limit is set for ${name}, which this section doesn't draw from.`);
      continue;
    }
    const available = distinctDrawable(drawable.filter((q) => q.topicId === t));
    if (l.min !== undefined && l.max !== undefined && l.min > l.max) block("blueprint.limit-min-above-max", `${name}: the minimum (${l.min}) is above the maximum (${l.max}).`);
    if ((l.min ?? 0) > available) block("blueprint.limit-min-too-big", `${name} must give at least ${l.min}, but only ${available} of its questions can appear together.`);
    minSum += l.min ?? 0;
  }
  for (const t of topics) {
    const available = distinctDrawable(drawable.filter((q) => q.topicId === t));
    maxSum += Math.min(limits[t]?.max ?? Infinity, available);
  }
  if (minSum > count) block("blueprint.limits-exceed-count", `The minimums add up to ${minSum}, but the section only asks for ${count}.`);
  if (maxSum < count) block("blueprint.limits-below-count", `With these maximums at most ${maxSum} questions can be drawn, but the section asks for ${count}.`);
  return issues;
}
