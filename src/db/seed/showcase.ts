// Showcase content: a "Lab Skills" topic with one question of each remaining
// type, an open exam that draws all of them, and a closed "Lab Report" exam
// with six submissions waiting in the marking queue. Keyed on the topic name,
// so it also runs on a database seeded before it existed, and never twice.
import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { type AttemptPoolItem, buildAttempt } from "@/engine/attempt";
import { finalizeAttempt } from "@/engine/attempts/finalize";
import { blueprintSchema } from "@/engine/selection/types";
import { getQuestionType } from "@/question-types/registry";
import * as schema from "../schema";
import { LAB_REPORTS, LAB_SKILLS, REPORT_ANSWERS, REPORT_EXAM, SHOWCASE_EXAM, SHOWCASE_QUESTIONS } from "./showcase-content";

type Db = PostgresJsDatabase<typeof schema>;

export async function seedShowcase(db: Db, courseId: string, authorId: string) {
  const [existing] = await db
    .select({ id: schema.topics.id })
    .from(schema.topics)
    .where(and(eq(schema.topics.courseId, courseId), eq(schema.topics.name, LAB_SKILLS)))
    .limit(1);
  if (existing) {
    console.log("  showcase   already present, left untouched");
    return;
  }

  const count = (await db.select({ id: schema.topics.id }).from(schema.topics).where(eq(schema.topics.courseId, courseId))).length;
  const topicIds: Record<string, string> = {};
  for (const [i, name] of [LAB_SKILLS, LAB_REPORTS].entries()) {
    const [t] = await db.insert(schema.topics).values({ courseId, name, position: count + i }).returning({ id: schema.topics.id });
    topicIds[name] = t.id;
  }

  const pool: AttemptPoolItem[] = [];
  for (const q of SHOWCASE_QUESTIONS) {
    const def = getQuestionType(q.type).defSchema.parse(q.def);
    const content = { type: q.type, def, weight: 1, difficulty: q.difficulty, points: q.points, tags: [] as string[], groupKey: null };
    const [row] = await db
      .insert(schema.questions)
      .values({ topicId: topicIds[q.topic], ...content, status: "active", createdBy: authorId })
      .returning({ id: schema.questions.id });
    const [v] = await db
      .insert(schema.questionVersions)
      .values({ questionId: row.id, version: 1, ...content, conflictsWith: [], createdBy: authorId })
      .returning({ id: schema.questionVersions.id });
    pool.push({ id: row.id, versionId: v.id, topicId: topicIds[q.topic], type: q.type, def, weight: 1, difficulty: q.difficulty, points: q.points, groupKey: null, conflictsWith: [] });
  }
  const locked = (topic: string) => Object.fromEntries(pool.filter((q) => q.topicId === topicIds[topic]).map((q) => [q.id, q.versionId]));
  const skills = SHOWCASE_QUESTIONS.filter((q) => q.topic === LAB_SKILLS).length;

  await db.insert(schema.exams).values({
    courseId,
    title: SHOWCASE_EXAM,
    description: "One question of every kind: ordering, matching, fill-in-the-blanks, a generated calculation, a table, a spreadsheet, an embedded till, and a written answer.",
    blueprint: {
      sections: [
        { topicId: topicIds[LAB_SKILLS], count: skills },
        { topicId: topicIds[LAB_REPORTS], count: 1 },
      ],
      shuffleQuestions: false,
    },
    settings: { timeLimitMinutes: 30, attemptsAllowed: 3, requireCode: false, oneWayNavigation: false, release: "explanations" },
    lockedVersions: { ...locked(LAB_SKILLS), ...locked(LAB_REPORTS) },
    state: "open",
    createdBy: authorId,
  });

  // The lab report: closed, with submissions only a person can mark.
  const blueprint = blueprintSchema.parse({ sections: [{ topicId: topicIds[LAB_REPORTS], count: 1 }], shuffleQuestions: false });
  const [exam] = await db
    .insert(schema.exams)
    .values({
      courseId,
      title: REPORT_EXAM,
      description: "A written method section, marked against a four-point rubric. Six students have submitted.",
      blueprint,
      settings: { timeLimitMinutes: 20, attemptsAllowed: 1, requireCode: false, oneWayNavigation: false, release: "feedback" },
      lockedVersions: locked(LAB_REPORTS),
      state: "closed",
      createdBy: authorId,
    })
    .returning({ id: schema.exams.id });

  const emails = REPORT_ANSWERS.map((_, i) => `student${String(i + 1).padStart(2, "0")}@example.com`);
  const students = await db.select({ id: schema.profiles.id, email: schema.profiles.email }).from(schema.profiles).where(inArray(schema.profiles.email, emails));
  const reportPool = pool.filter((q) => q.topicId === topicIds[LAB_REPORTS]);
  let made = 0;
  for (const [i, email] of emails.entries()) {
    const student = students.find((s) => s.email === email);
    if (!student) continue;
    await db.insert(schema.enrollments).values({ courseId, userId: student.id }).onConflictDoNothing();
    const seed = `lab-report-seed-${i + 1}`;
    const built = buildAttempt(seed, blueprint, reportPool);
    const started = new Date(Date.UTC(2026, 10, 10, 13, 0, 0) + i * 90_000);
    const [attempt] = await db
      .insert(schema.attempts)
      .values({ examId: exam.id, userId: student.id, seed, state: "submitted", startedAt: started, deadlineAt: new Date(started.getTime() + 20 * 60_000), submittedAt: new Date(started.getTime() + (9 + i) * 60_000) })
      .returning({ id: schema.attempts.id });
    const items = await db
      .insert(schema.attemptItems)
      .values(built.items.map((it) => ({ attemptId: attempt.id, questionVersionId: it.versionId, seedVersionId: it.versionId, position: it.position, instance: it.instance })))
      .returning({ id: schema.attemptItems.id, position: schema.attemptItems.position });
    const idAt = new Map(items.map((it) => [it.position, it.id]));
    const answer = { text: REPORT_ANSWERS[i] };
    const graded = finalizeAttempt(built.items.map((it) => ({ id: idAt.get(it.position)!, type: it.type, instance: it.instance, response: answer, points: it.points })));
    for (const it of built.items) await db.insert(schema.responses).values({ attemptItemId: idAt.get(it.position)!, response: answer, seq: 1 });
    await db.insert(schema.grades).values(graded.items.map((g) => ({ attemptItemId: g.id, score: g.score, max: g.max, lines: g.lines, needsReview: g.needsReview })));
    await db.update(schema.attempts).set({ score: graded.score, maxScore: graded.max }).where(eq(schema.attempts.id, attempt.id));
    made++;
  }
  console.log(`  showcase   ${SHOWCASE_QUESTIONS.length} questions (every other type), ${SHOWCASE_EXAM}, ${REPORT_EXAM} with ${made} to mark`);
}
