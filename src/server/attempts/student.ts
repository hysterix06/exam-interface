import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { attempts, courses, enrollments, exams, topics } from "@/db/schema";
import { examSettingsSchema } from "@/engine/exam";
import { effectiveState } from "@/engine/exam-state";
import { blueprintSchema } from "@/engine/selection/types";
import type { CurrentUser } from "@/server/auth";

async function topicNames(ids: string[]) {
  if (ids.length === 0) return {} as Record<string, string>;
  const rows = await db.select({ id: topics.id, name: topics.name }).from(topics).where(inArray(topics.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
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
  const mine = rows.length
    ? await db
        .select()
        .from(attempts)
        .where(
          and(
            eq(attempts.userId, user.id),
            eq(attempts.isPreview, false),
            inArray(attempts.examId, rows.map((r) => r.exam.id)),
          ),
        )
        .orderBy(desc(attempts.startedAt))
    : [];

  return rows.map(({ exam, courseTitle }) => {
    const bp = blueprintSchema.safeParse(exam.blueprint);
    const settings = examSettingsSchema.parse(exam.settings);
    const theirs = mine.filter((a) => a.examId === exam.id);
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
      attempts: theirs.map((a) => ({ id: a.id, state: a.state, startedAt: a.startedAt.toISOString() })),
      inProgressId: theirs.find((a) => a.state === "in_progress")?.id ?? null,
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
    .innerJoin(enrollments, and(eq(enrollments.courseId, exams.courseId), eq(enrollments.userId, user.id)))
    .where(and(eq(exams.orgId, user.orgId), ne(exams.state, "draft")))
    .orderBy(desc(exams.updatedAt));
  return describe(user, rows);
}

export async function getStudentExam(user: CurrentUser, examId: string) {
  const rows = await db
    .select({ exam: exams, courseTitle: courses.title })
    .from(exams)
    .innerJoin(courses, eq(courses.id, exams.courseId))
    .innerJoin(enrollments, and(eq(enrollments.courseId, exams.courseId), eq(enrollments.userId, user.id)))
    .where(and(eq(exams.id, examId), eq(exams.orgId, user.orgId), ne(exams.state, "draft")))
    .limit(1);
  return (await describe(user, rows))[0] ?? null;
}

