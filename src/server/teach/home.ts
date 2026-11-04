import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { attemptItems, attempts, grades } from "@/db/schema";
import { effectiveState } from "@/engine/exam-state";
import type { Scope } from "@/server/access";
import { listCourses, listExams } from "@/server/authoring/data";
import { preflightFor } from "@/server/authoring/exams";

/** In-progress / finished attempt counts and answers awaiting marking, per exam. */
export async function examActivity(ids: string[]) {
  if (ids.length === 0) return { activity: [], marking: [] };
  const [activity, marking] = await Promise.all([
    db
      .select({
        examId: attempts.examId,
        live: sql<number>`count(*) filter (where ${attempts.state} = 'in_progress')::int`,
        finished: sql<number>`count(*) filter (where ${attempts.state} <> 'in_progress')::int`,
      })
      .from(attempts)
      .where(and(inArray(attempts.examId, ids), eq(attempts.isPreview, false)))
      .groupBy(attempts.examId),
    db
      .select({ examId: attempts.examId, n: sql<number>`count(*)::int` })
      .from(grades)
      .innerJoin(attemptItems, eq(attemptItems.id, grades.attemptItemId))
      .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
      .where(and(inArray(attempts.examId, ids), eq(attempts.isPreview, false), eq(grades.needsReview, true)))
      .groupBy(attempts.examId),
  ]);
  return { activity, marking };
}

/**
 * The instructor's home is a queue of what needs them, not a menu: exams
 * running now, answers to mark, results to release, drafts that can't publish,
 * and what's coming up.
 */
export async function loadTeachHome(scope: Scope) {
  const [courseList, examList] = await Promise.all([listCourses(scope), listExams(scope)]);
  const now = new Date();
  const ids = examList.map((e) => e.id);

  const { activity, marking } = await examActivity(ids);

  const exams = examList.map((e) => ({
    ...e,
    effective: effectiveState(e, now),
    live: activity.find((a) => a.examId === e.id)?.live ?? 0,
    finished: activity.find((a) => a.examId === e.id)?.finished ?? 0,
    toMark: marking.find((m) => m.examId === e.id)?.n ?? 0,
  }));

  // Pre-flight is cheap (pure engine over one course's pool) but not free; only
  // the few most recently edited drafts are checked.
  const drafts = await Promise.all(
    exams
      .filter((e) => e.state === "draft")
      .slice(0, 5)
      .map(async (e) => {
        const { report } = await preflightFor({ ...e, orgId: scope.orgId });
        const first = report.items.find((i) => i.status === "fail");
        return { ...e, blocking: report.blocking, firstIssue: first ? (first.problems[0] ?? first.title) : null };
      }),
  );

  return {
    courses: courseList,
    live: exams.filter((e) => e.effective === "open"),
    toMark: exams.filter((e) => e.toMark > 0),
    toRelease: exams.filter((e) => (e.state === "closed" || e.state === "graded") && e.finished > 0 && e.toMark === 0),
    drafts,
    upcoming: exams
      .filter((e) => e.effective === "scheduled")
      .sort((a, b) => (a.opensAt?.getTime() ?? Infinity) - (b.opensAt?.getTime() ?? Infinity)),
    totals: {
      exams: exams.length,
      drafts: exams.filter((e) => e.state === "draft").length,
    },
  };
}
