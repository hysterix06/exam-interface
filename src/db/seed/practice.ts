// Demo results: 30 simulated students who sat "BIO 101 Practice (results)".
// Each has an ability, and answers each question right with a probability that
// depends on that ability and the question's difficulty, so item analysis has a
// realistic spread to show (strong students beat weak ones, hard questions are
// missed more). Everything is seeded: running it twice gives the same data.
import type { SupabaseClient } from "@supabase/supabase-js";
import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { type AttemptPoolItem, buildAttempt } from "@/engine/attempt";
import { finalizeAttempt } from "@/engine/attempts/finalize";
import { createRng } from "@/engine/rng";
import { blueprintSchema } from "@/engine/selection/types";
import { getQuestionType } from "@/question-types/registry";
import * as schema from "../schema";

const TITLE = "BIO 101 Practice (results)";
const STUDENTS = 30;

type Db = PostgresJsDatabase<typeof schema>;

export async function seedPracticeResults(db: Db, supabase: SupabaseClient, password: string, courseId: string, authorId: string) {
  const [existing] = await db.select({ id: schema.exams.id }).from(schema.exams).where(eq(schema.exams.title, TITLE)).limit(1);
  if (existing) {
    console.log("  results    already present, left untouched");
    return;
  }

  const topics = await db.select().from(schema.topics).where(eq(schema.topics.courseId, courseId));
  const byName = Object.fromEntries(topics.map((t) => [t.name, t.id]));
  if (!byName["Cell Biology"] || !byName["Genetics"] || !byName["Ecology"]) return;

  const rows = await db
    .select({
      id: schema.questions.id,
      versionId: schema.questionVersions.id,
      topicId: schema.questions.topicId,
      type: schema.questionVersions.type,
      def: schema.questionVersions.def,
      weight: schema.questionVersions.weight,
      difficulty: schema.questionVersions.difficulty,
      points: schema.questionVersions.points,
      groupKey: schema.questionVersions.groupKey,
      conflictsWith: schema.questionVersions.conflictsWith,
    })
    .from(schema.questions)
    .innerJoin(
      schema.questionVersions,
      and(eq(schema.questionVersions.questionId, schema.questions.id), eq(schema.questionVersions.version, schema.questions.version)),
    )
    .where(and(eq(schema.questions.status, "active"), inArray(schema.questions.topicId, Object.values(byName))));
  const pool: AttemptPoolItem[] = rows;

  const blueprint = blueprintSchema.parse({
    sections: [
      { topicId: byName["Cell Biology"], count: 4 },
      { topicId: byName["Genetics"], count: 3 },
      { topicId: byName["Ecology"], count: 3 },
    ],
    shuffleQuestions: true,
  });

  const [exam] = await db
    .insert(schema.exams)
    .values({
      courseId,
      title: TITLE,
      description: "Thirty simulated students, already graded. Open the item analysis to see which questions work.",
      blueprint,
      settings: { timeLimitMinutes: 30, attemptsAllowed: 1, requireCode: false, oneWayNavigation: false, release: "explanations" },
      lockedVersions: Object.fromEntries(pool.map((q) => [q.id, q.versionId])),
      state: "released",
      createdBy: authorId,
    })
    .returning({ id: schema.exams.id });

  const { data: listed } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  let made = 0;
  for (let i = 1; i <= STUDENTS; i++) {
    const email = `student${String(i).padStart(2, "0")}@example.com`;
    const fullName = `Demo Student ${String(i).padStart(2, "0")}`;
    let id = listed?.users.find((u) => u.email === email)?.id;
    if (!id) {
      const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
      if (error) throw error;
      id = data.user.id;
    }
    await db.update(schema.profiles).set({ role: "student", fullName }).where(eq(schema.profiles.id, id));
    await db.insert(schema.enrollments).values({ courseId, userId: id }).onConflictDoNothing();

    const rng = createRng(`practice:${i}`);
    // Ability spread roughly -1.5 .. +1.5; difficulty 1..3 maps to -1 .. +1.
    const ability = (i / STUDENTS) * 3 - 1.5 + rng.float(-0.4, 0.4);
    const seed = `practice-seed-${i}`;
    const built = buildAttempt(seed, blueprint, pool);

    const answers = built.items.map((item) => {
      const type = getQuestionType(item.type);
      const pCorrect = 1 / (1 + Math.exp(-(ability - (item.instance ? (poolDifficulty(pool, item.questionId) - 2) : 0)) * 1.6));
      const r = rng.fork(`q:${item.questionId}`);
      if (r.next() < 0.03) return null; // occasionally left blank
      return r.next() < pCorrect ? type.keyResponse(item.instance) : type.randomResponse(item.instance, r.fork("wrong"));
    });

    const started = new Date(Date.UTC(2026, 9, 20, 9, 0, 0) + i * 60_000);
    const [attempt] = await db
      .insert(schema.attempts)
      .values({ examId: exam.id, userId: id, seed, state: "graded", startedAt: started, deadlineAt: new Date(started.getTime() + 30 * 60_000), submittedAt: new Date(started.getTime() + (12 + (i % 15)) * 60_000) })
      .returning({ id: schema.attempts.id });

    const items = await db
      .insert(schema.attemptItems)
      .values(built.items.map((it) => ({ attemptId: attempt.id, questionVersionId: it.versionId, position: it.position, instance: it.instance })))
      .returning({ id: schema.attemptItems.id, position: schema.attemptItems.position });
    const idAt = new Map(items.map((it) => [it.position, it.id]));

    const graded = finalizeAttempt(
      built.items.map((it, k) => ({ id: idAt.get(it.position)!, type: it.type, instance: it.instance, response: answers[k], points: it.points })),
    );
    for (const [k, it] of built.items.entries()) {
      if (answers[k] !== null) await db.insert(schema.responses).values({ attemptItemId: idAt.get(it.position)!, response: answers[k], seq: 1 });
    }
    await db.insert(schema.grades).values(
      graded.items.map((g) => ({ attemptItemId: g.id, score: g.score, max: g.max, lines: g.lines, needsReview: g.needsReview })),
    );
    await db.update(schema.attempts).set({ score: graded.score, maxScore: graded.max }).where(eq(schema.attempts.id, attempt.id));
    made++;
  }
  console.log(`  results    ${TITLE}: ${made} graded students`);
}

function poolDifficulty(pool: AttemptPoolItem[], questionId: string) {
  return pool.find((q) => q.id === questionId)?.difficulty ?? 2;
}
