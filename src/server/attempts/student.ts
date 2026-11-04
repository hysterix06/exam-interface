import "server-only";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { attempts, courses, enrollments, exams, topics } from "@/db/schema";
import { examSettingsSchema } from "@/engine/exam";
import { visibility } from "@/engine/attempts/release";
import { effectiveState } from "@/engine/exam-state";
import { blueprintSchema } from "@/engine/selection/types";
import { isExpired } from "@/engine/attempts/deadline";
import type { CurrentUser } from "@/server/auth";
import { finalizeMany, windowClosed } from "./take";

async function topicNames(ids: string[]) {
  if (ids.length === 0) return {} as Record<string, string>;
  const rows = await db.select({ id: topics.id, name: topics.name }).from(topics).where(inArray(topics.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

async function ownAttempts(user: CurrentUser, rows: { exam: typeof exams.$inferSelect }[]) {
  if (rows.length === 0) return [];
  return db
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, user.id),
        eq(attempts.isPreview, false),
        inArray(attempts.examId, rows.map((r) => r.exam.id)),
      ),
    )
    .orderBy(desc(attempts.startedAt));
}

async function describe(user: CurrentUser, rows: { exam: typeof exams.$inferSelect; courseTitle: string }[]) {
  const names = await topicNames([
    ...new Set(
      rows.flatMap(({ exam }) => {
        const bp = blueprintSchema.safeParse(exam.blueprint);
        return bp.success ? bp.data.sections.map((s) => s.topicId) : [];
      }),
    ),
  ]);
  const mine = await ownAttempts(user, rows);
  // Time ran out while the student was away: finish those first so the home
  // screen never offers to "resume" an attempt that's already over.
  const now = new Date();
  const stale = mine.filter((a) => {
    if (a.state !== "in_progress") return false;
    const exam = rows.find((r) => r.exam.id === a.examId)!.exam;
    return isExpired(a.deadlineAt, now) || windowClosed(exam, now);
  });
  if (stale.length > 0) {
    await finalizeMany(stale.map((a) => a.id));
    mine.splice(0, mine.length, ...(await ownAttempts(user, rows)));
  }

  return rows.map(({ exam, courseTitle }) => {
    const bp = blueprintSchema.safeParse(exam.blueprint);
    const settings = examSettingsSchema.parse(exam.settings);
    const theirs = mine.filter((a) => a.examId === exam.id);
    const live = theirs.find((a) => a.state === "in_progress");
    const visible = visibility(exam.state, settings.release).score;
    return {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      courseTitle,
      state: effectiveState(exam, new Date()),
      opensAt: exam.opensAt?.toISOString() ?? null,
      closesAt: exam.closesAt?.toISOString() ?? null,
      settings,
      questionCount: bp.success ? bp.data.sections.reduce((s, x) => s + x.count, 0) : 0,
      topics: bp.success ? [...new Set(bp.data.sections.map((s) => names[s.topicId]).filter(Boolean))] : [],
      attempts: theirs.map((a) => ({
        id: a.id,
        state: a.state,
        startedAt: a.startedAt.toISOString(),
        submittedAt: a.submittedAt?.toISOString() ?? null,
        // Scores only once the release setting allows it.
        score: visible && a.state === "graded" ? a.score : null,
        maxScore: visible && a.state === "graded" ? a.maxScore : null,
      })),
      inProgressId: live?.id ?? null,
      deadlineAt: live?.deadlineAt?.toISOString() ?? null,
      resultsVisible: visible,
      attemptsLeft: Math.max(0, settings.attemptsAllowed - theirs.length),
    };
  });
}

/** Exams a student can see: published ones in courses they're enrolled in. */
export async function listStudentExams(user: CurrentUser) {
  const rows = await db
    .select({ exam: exams, courseTitle: courses.title })
    .from(exams)
    .innerJoin(courses, eq(courses.id, exams.courseId))
    .innerJoin(enrollments, and(eq(enrollments.courseId, exams.courseId), eq(enrollments.userId, user.id), eq(enrollments.role, "student")))
    .where(and(eq(exams.orgId, user.orgId), ne(exams.state, "draft"), isNull(courses.archivedAt)))
    .orderBy(desc(exams.updatedAt));
  return describe(user, rows);
}

export type StudentExam = Awaited<ReturnType<typeof listStudentExams>>[number];

/** Courses the student is enrolled in, for the empty state and the header. */
export async function listStudentCourses(user: CurrentUser) {
  return db
    .select({ id: courses.id, code: courses.code, title: courses.title })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(and(eq(enrollments.userId, user.id), eq(enrollments.role, "student"), isNull(courses.archivedAt)));
}

export async function getStudentExam(user: CurrentUser, examId: string) {
  const rows = await db
    .select({ exam: exams, courseTitle: courses.title })
    .from(exams)
    .innerJoin(courses, eq(courses.id, exams.courseId))
    .innerJoin(enrollments, and(eq(enrollments.courseId, exams.courseId), eq(enrollments.userId, user.id), eq(enrollments.role, "student")))
    .where(and(eq(exams.id, examId), eq(exams.orgId, user.orgId), ne(exams.state, "draft"), isNull(courses.archivedAt)))
    .limit(1);
  return (await describe(user, rows))[0] ?? null;
}

