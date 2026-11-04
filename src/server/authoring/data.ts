import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { courses, exams, questions, questionVersions, topics } from "@/db/schema";
import type { AttemptPoolItem } from "@/engine/attempt";
import { inScope, type Scope } from "@/server/access";

/** Courses this person teaches (every live course for an admin). */
export async function listCourses(scope: Scope) {
  return db
    .select()
    .from(courses)
    .where(and(eq(courses.orgId, scope.orgId), isNull(courses.archivedAt), inScope(courses.id, scope)))
    .orderBy(asc(courses.title));
}

export async function getCourse(scope: Scope, id: string) {
  const [row] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), eq(courses.orgId, scope.orgId), inScope(courses.id, scope)))
    .limit(1);
  return row ?? null;
}

export async function listTopics(scope: Scope, courseId?: string) {
  const counts = db
    .select({ topicId: questions.topicId, n: count().as("n") })
    .from(questions)
    .groupBy(questions.topicId)
    .as("counts");
  return db
    .select({
      id: topics.id,
      courseId: topics.courseId,
      courseTitle: courses.title,
      name: topics.name,
      position: topics.position,
      questionCount: sql<number>`coalesce(${counts.n}, 0)::int`,
    })
    .from(topics)
    .innerJoin(courses, eq(courses.id, topics.courseId))
    .leftJoin(counts, eq(counts.topicId, topics.id))
    .where(
      and(
        eq(topics.orgId, scope.orgId),
        isNull(courses.archivedAt),
        inScope(topics.courseId, scope),
        courseId ? eq(topics.courseId, courseId) : undefined,
      ),
    )
    .orderBy(asc(courses.title), asc(topics.position), asc(topics.name));
}

export interface QuestionFilters {
  courseId?: string;
  topicId?: string;
  type?: string;
  status?: "draft" | "active" | "archived";
  search?: string;
}

export async function listQuestions(scope: Scope, f: QuestionFilters = {}) {
  const where = and(
    eq(questions.orgId, scope.orgId),
    inScope(topics.courseId, scope),
    f.courseId ? eq(topics.courseId, f.courseId) : undefined,
    f.topicId ? eq(questions.topicId, f.topicId) : undefined,
    f.type ? eq(questions.type, f.type) : undefined,
    f.status ? eq(questions.status, f.status) : undefined,
    f.search ? ilike(sql`${questions.def}->>'stem'`, `%${f.search.replace(/[%_]/g, "\\$&")}%`) : undefined,
  );
  return db
    .select({
      id: questions.id,
      type: questions.type,
      def: questions.def,
      topicId: questions.topicId,
      topicName: topics.name,
      courseTitle: courses.title,
      weight: questions.weight,
      difficulty: questions.difficulty,
      points: questions.points,
      status: questions.status,
      version: questions.version,
      updatedAt: questions.updatedAt,
    })
    .from(questions)
    .innerJoin(topics, eq(topics.id, questions.topicId))
    .innerJoin(courses, eq(courses.id, topics.courseId))
    .where(where)
    .orderBy(desc(questions.updatedAt))
    .limit(500);
}

export async function getQuestion(scope: Scope, id: string) {
  const [row] = await db
    .select({ question: questions })
    .from(questions)
    .innerJoin(topics, eq(topics.id, questions.topicId))
    .where(and(eq(questions.id, id), eq(questions.orgId, scope.orgId), inScope(topics.courseId, scope)))
    .limit(1);
  return row?.question ?? null;
}

/** Version history. Callers check access with getQuestion first. */
export async function listVersions(questionId: string) {
  return db
    .select({
      id: questionVersions.id,
      version: questionVersions.version,
      def: questionVersions.def,
      createdAt: questionVersions.createdAt,
    })
    .from(questionVersions)
    .where(eq(questionVersions.questionId, questionId))
    .orderBy(desc(questionVersions.version));
}

/**
 * Active questions in one course with the version id each would be drawn at.
 * This is the "pool" the engine's selector, pre-flight and simulator work from.
 */
export async function loadPool(orgId: string, courseId: string): Promise<AttemptPoolItem[]> {
  return db
    .select({
      id: questions.id,
      versionId: questionVersions.id,
      topicId: questions.topicId,
      type: questions.type,
      def: questionVersions.def,
      weight: questionVersions.weight,
      difficulty: questionVersions.difficulty,
      points: questionVersions.points,
      groupKey: questionVersions.groupKey,
      conflictsWith: questionVersions.conflictsWith,
    })
    .from(questions)
    .innerJoin(topics, eq(topics.id, questions.topicId))
    .innerJoin(
      questionVersions,
      and(eq(questionVersions.questionId, questions.id), eq(questionVersions.version, questions.version)),
    )
    .where(and(eq(questions.orgId, orgId), eq(topics.courseId, courseId), eq(questions.status, "active")));
}

export async function listExams(scope: Scope, courseId?: string) {
  return db
    .select({
      id: exams.id,
      title: exams.title,
      state: exams.state,
      courseId: exams.courseId,
      courseTitle: courses.title,
      blueprint: exams.blueprint,
      settings: exams.settings,
      opensAt: exams.opensAt,
      closesAt: exams.closesAt,
      updatedAt: exams.updatedAt,
    })
    .from(exams)
    .innerJoin(courses, eq(courses.id, exams.courseId))
    .where(
      and(
        eq(exams.orgId, scope.orgId),
        isNull(courses.archivedAt),
        inScope(exams.courseId, scope),
        courseId ? eq(exams.courseId, courseId) : undefined,
      ),
    )
    .orderBy(desc(exams.updatedAt));
}

export async function getExam(scope: Scope, id: string) {
  const [row] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.id, id), eq(exams.orgId, scope.orgId), inScope(exams.courseId, scope)))
    .limit(1);
  return row ?? null;
}

export async function topicNames(orgId: string, ids: string[]) {
  if (ids.length === 0) return {} as Record<string, string>;
  const rows = await db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(and(eq(topics.orgId, orgId), inArray(topics.id, ids)));
  return Object.fromEntries(rows.map((r) => [r.id, r.name])) as Record<string, string>;
}
