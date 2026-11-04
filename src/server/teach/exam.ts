import "server-only";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/db/client";
import { attempts, courses, topics } from "@/db/schema";
import { examSettingsSchema } from "@/engine/exam";
import { effectiveState } from "@/engine/exam-state";
import { blueprintSchema } from "@/engine/selection/types";
import { requireStaff } from "@/server/access";
import { getExam } from "@/server/authoring/data";

/**
 * The exam behind every tab of the exam workspace. Cached per request, so the
 * layout and the page share one lookup. 404 for anything outside your courses.
 */
export const workspaceExam = cache(async (id: string) => {
  const { user, scope } = await requireStaff();
  if (!z.guid().safeParse(id).success) notFound();
  const exam = await getExam(scope, id);
  if (!exam) notFound();
  const [[course], courseTopics, [{ n }]] = await Promise.all([
    db.select({ id: courses.id, title: courses.title, code: courses.code }).from(courses).where(eq(courses.id, exam.courseId)).limit(1),
    db
      .select({ id: topics.id, name: topics.name })
      .from(topics)
      .where(eq(topics.courseId, exam.courseId))
      .orderBy(asc(topics.position), asc(topics.name)),
    db.select({ n: count() }).from(attempts).where(eq(attempts.examId, exam.id)),
  ]);
  return {
    user,
    scope,
    exam,
    course,
    topics: courseTopics,
    effective: effectiveState(exam, new Date()),
    settings: examSettingsSchema.parse(exam.settings),
    blueprint: blueprintSchema.parse({ sections: [], shuffleQuestions: true, ...(exam.blueprint as object) }),
    /** Including previews: used to decide which tabs have anything in them. */
    attemptCount: n,
  };
});

/** Your own "take it as a student" runs of this exam, newest first. */
export async function listMyPreviews(examId: string, userId: string) {
  return db
    .select({ id: attempts.id, state: attempts.state, startedAt: attempts.startedAt, score: attempts.score, maxScore: attempts.maxScore })
    .from(attempts)
    .where(and(eq(attempts.examId, examId), eq(attempts.userId, userId), eq(attempts.isPreview, true)))
    .orderBy(desc(attempts.startedAt))
    .limit(5);
}
