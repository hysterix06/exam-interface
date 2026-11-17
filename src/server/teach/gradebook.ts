import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { assignmentExtensions, assignments, attempts, enrollments, exams, gradeCategories, profiles, submissionGrades, submissions } from "@/db/schema";
import { parseAssignmentSettings } from "@/engine/assignments/settings";
import { assignmentState } from "@/engine/assignments/state";
import { effectiveState } from "@/engine/exam-state";
import { courseGrade, type CourseGrade, type GradebookItem } from "@/engine/gradebook/course-grade";
import { fmtNum } from "@/engine/grading/format";

export interface GradebookColumn {
  id: string;
  kind: "exam" | "assignment";
  title: string;
  categoryId: string | null;
  /** Students can see these marks. */
  released: boolean;
}

export interface GradebookCell {
  score: number | null;
  max: number;
  /** What to show when there is no score: "Missing", "To mark", "—". */
  note: string;
  excused?: boolean;
}

/**
 * The course gradebook as staff see it: every student × every published exam
 * and assignment, with the course grade over everything marked so far
 * (released or not; the column header says which students can see).
 */
export async function courseGradebook(courseId: string) {
  const now = new Date();
  const [students, categories, examRows, workRows] = await Promise.all([
    db
      .select({ id: profiles.id, name: profiles.fullName, email: profiles.email })
      .from(enrollments)
      .innerJoin(profiles, eq(profiles.id, enrollments.userId))
      .where(and(eq(enrollments.courseId, courseId), eq(enrollments.role, "student"), isNull(profiles.deactivatedAt)))
      .orderBy(asc(profiles.fullName), asc(profiles.email)),
    db.select().from(gradeCategories).where(eq(gradeCategories.courseId, courseId)).orderBy(asc(gradeCategories.position)),
    db.select().from(exams).where(and(eq(exams.courseId, courseId), ne(exams.state, "draft"))).orderBy(asc(exams.opensAt), asc(exams.title)),
    db.select().from(assignments).where(and(eq(assignments.courseId, courseId), eq(assignments.state, "published"))).orderBy(asc(assignments.dueAt), asc(assignments.title)),
  ]);
  const examIds = examRows.map((e) => e.id);
  const workIds = workRows.map((a) => a.id);
  const [tries, subs, exts] = await Promise.all([
    examIds.length
      ? db
          .select({ examId: attempts.examId, userId: attempts.userId, score: attempts.score, max: attempts.maxScore, state: attempts.state })
          .from(attempts)
          .where(and(inArray(attempts.examId, examIds), eq(attempts.isPreview, false)))
      : [],
    workIds.length
      ? db
          .selectDistinctOn([submissions.assignmentId, submissions.userId], { assignmentId: submissions.assignmentId, userId: submissions.userId, grade: submissionGrades })
          .from(submissions)
          .leftJoin(submissionGrades, eq(submissionGrades.submissionId, submissions.id))
          .where(inArray(submissions.assignmentId, workIds))
          .orderBy(submissions.assignmentId, submissions.userId, desc(submissions.version))
      : [],
    workIds.length ? db.select().from(assignmentExtensions).where(inArray(assignmentExtensions.assignmentId, workIds)) : [],
  ]);

  const columns: GradebookColumn[] = [
    ...examRows.map((e) => ({ id: e.id, kind: "exam" as const, title: e.title, categoryId: e.categoryId, released: effectiveState(e, now) === "released" })),
    ...workRows.map((a) => ({ id: a.id, kind: "assignment" as const, title: a.title, categoryId: a.categoryId, released: !!a.releasedAt && a.releasedAt <= now })),
  ];
  const cats = categories.map((c) => ({ id: c.id, name: c.name, weight: c.weight, dropLowest: c.dropLowest }));

  const rows = students.map((s) => {
    const cells = new Map<string, GradebookCell>();
    for (const e of examRows) {
      const mine = tries.filter((t) => t.examId === e.id && t.userId === s.id);
      const graded = mine.filter((t) => t.state === "graded" && t.score !== null && t.max);
      const best = graded.sort((a, b) => b.score! / b.max! - a.score! / a.max!)[0];
      cells.set(e.id, best ? { score: best.score, max: best.max!, note: "" } : { score: null, max: 0, note: mine.length ? "To mark" : "—" });
    }
    for (const a of workRows) {
      const sub = subs.find((x) => x.assignmentId === a.id && x.userId === s.id);
      const ext = exts.find((x) => x.assignmentId === a.id && x.userId === s.id);
      const state = assignmentState({ state: a.state, opensAt: a.opensAt, dueAt: a.dueAt, late: parseAssignmentSettings(a.settings).late }, now, ext?.dueAt);
      if (sub?.grade) cells.set(a.id, { score: sub.grade.score, max: sub.grade.max, note: "", excused: sub.grade.excused });
      else if (sub) cells.set(a.id, { score: null, max: a.points, note: "To mark" });
      else if (state === "closed") cells.set(a.id, { score: 0, max: a.points, note: "Missing" });
      else cells.set(a.id, { score: null, max: a.points, note: "—" });
    }
    const items: GradebookItem[] = columns.map((c) => {
      const cell = cells.get(c.id)!;
      return { id: c.id, title: c.title, kind: c.kind, categoryId: c.categoryId, score: cell.score, max: cell.max, excused: cell.excused };
    });
    return { student: { id: s.id, name: s.name ?? s.email, email: s.email }, cells, grade: courseGrade(cats, items) };
  });
  return { columns, categories: cats, rows };
}

export type Gradebook = Awaited<ReturnType<typeof courseGradebook>>;

const pct = (g: CourseGrade) => (g.percent === null ? "" : fmtNum(Math.round(g.percent * 10) / 10));

/** One row per student: name, email, every item's score, the course grade. */
export function gradebookCsvRows(b: Gradebook): (string | number | null)[][] {
  return [
    ["Student", "Email", ...b.columns.map((c) => `${c.title} (${c.kind})`), "Course grade %"],
    ...b.rows.map((r) => [
      r.student.name,
      r.student.email,
      ...b.columns.map((c) => {
        const cell = r.cells.get(c.id)!;
        return cell.excused ? "excused" : cell.score === null ? "" : cell.score;
      }),
      pct(r.grade),
    ]),
  ];
}
