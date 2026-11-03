import "server-only";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { courses, exams, questions, questionVersions, topics } from "@/db/schema";
import type { AttemptPoolItem } from "@/engine/attempt";

export async function listCourses(orgId: string) {
  return db.select().from(courses).where(eq(courses.orgId, orgId)).orderBy(asc(courses.title));
}

export async function listTopics(orgId: string) {
  return db
    .select({
      id: topics.id,
      courseId: topics.courseId,
      courseTitle: courses.title,
      name: topics.name,
      position: topics.position,
      questionCount: sql<number>`(select count(*)::int from ${questions} where ${questions.topicId} = ${topics.id})`,
    })
    .from(topics)
    .innerJoin(courses, eq(courses.id, topics.courseId))
    .where(eq(topics.orgId, orgId))
    .orderBy(asc(courses.title), asc(topics.position), asc(topics.name));
}

export interface QuestionFilters {
  topicId?: string;
  type?: string;
  status?: "draft" | "active" | "archived";
  search?: string;
}

export async function listQuestions(orgId: string, f: QuestionFilters = {}) {
  const where = and(
    eq(questions.orgId, orgId),
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
      weight: questions.weight,
      difficulty: questions.difficulty,
      points: questions.points,
      status: questions.status,
      version: questions.version,
      updatedAt: questions.updatedAt,
    })
    .from(questions)
    .innerJoin(topics, eq(topics.id, questions.topicId))
    .where(where)
    .orderBy(desc(questions.updatedAt))
    .limit(500);
}

export async function getQuestion(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, id), eq(questions.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

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
 * Active questions with the version id each would be drawn at. This is the
 * "pool" the engine's selector, pre-flight and simulator work from.
 */
export async function loadPool(orgId: string): Promise<AttemptPoolItem[]> {
  const rows = await db
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
    .innerJoin(
      questionVersions,
      and(eq(questionVersions.questionId, questions.id), eq(questionVersions.version, questions.version)),
    )
    .where(and(eq(questions.orgId, orgId), eq(questions.status, "active")));
  return rows;
}

export async function listExams(orgId: string) {
  return db
    .select({
      id: exams.id,
      title: exams.title,
      state: exams.state,
      courseTitle: courses.title,
      blueprint: exams.blueprint,
      updatedAt: exams.updatedAt,
    })
    .from(exams)
    .innerJoin(courses, eq(courses.id, exams.courseId))
    .where(eq(exams.orgId, orgId))
    .orderBy(desc(exams.updatedAt));
}

export async function getExam(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.id, id), eq(exams.orgId, orgId)))
    .limit(1);
  return row ?? null;
}
