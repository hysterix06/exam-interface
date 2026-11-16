import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  attemptItems,
  attempts,
  auditLog,
  enrollments,
  events,
  exams,
  extensions,
  grades,
  profiles,
  questions,
  questionVersions,
  responses,
  topics,
} from "@/db/schema";
import { buildAttempt } from "@/engine/attempt";
import { computeDeadline } from "@/engine/attempts/deadline";
import { examSettingsSchema } from "@/engine/exam";
import type { ItemInput, SummaryInput } from "@/engine/export";
import { topicMastery } from "@/engine/mastery";
import { compareReproduction } from "@/engine/regrade";
import { createRng, questionSeed } from "@/engine/rng";
import { explainSelection } from "@/engine/selection/explain";
import { blueprintSchema } from "@/engine/selection/types";
import { questionLabel } from "@/lib/question-label";
import { getQuestionType } from "@/question-types/registry";
import { inScope, type Scope, scopeFor } from "@/server/access";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";
import { getExam, loadPool } from "@/server/authoring/data";
import type { ActionResult } from "@/server/authoring/questions";
import { lockedPool } from "@/server/attempts/start";
import { sweepExpired } from "@/server/attempts/take";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Everyone who has started the exam, with progress and integrity signals. */
export async function loadLive(scope: Scope, examId: string) {
  const exam = await getExam(scope, examId);
  if (!exam) return null;
  await sweepExpired(exam);

  const real = and(eq(attempts.examId, examId), eq(attempts.isPreview, false));
  // Grouped per attempt in three queries rather than five subqueries per row:
  // this is polled every few seconds while an exam is live.
  const [rows, items, signals] = await Promise.all([
    db
      .select({
        id: attempts.id,
        userId: attempts.userId,
        name: profiles.fullName,
        email: profiles.email,
        state: attempts.state,
        startedAt: attempts.startedAt,
        deadlineAt: attempts.deadlineAt,
        score: attempts.score,
        maxScore: attempts.maxScore,
      })
      .from(attempts)
      .innerJoin(profiles, eq(profiles.id, attempts.userId))
      .where(real)
      .orderBy(desc(attempts.startedAt)),
    db
      .select({
        attemptId: attemptItems.attemptId,
        total: sql<number>`count(*)::int`,
        answered: sql<number>`count(${responses.id})::int`,
        lastSaved: sql<string | null>`max(${responses.updatedAt})`,
      })
      .from(attemptItems)
      .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
      .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
      .where(real)
      .groupBy(attemptItems.attemptId),
    db
      .select({
        attemptId: events.attemptId,
        blurs: sql<number>`count(*) filter (where ${events.type} = 'blur')::int`,
        pastes: sql<number>`count(*) filter (where ${events.type} = 'paste')::int`,
      })
      .from(events)
      .innerJoin(attempts, eq(attempts.id, events.attemptId))
      .where(real)
      .groupBy(events.attemptId),
  ]);
  const itemsBy = new Map(items.map((i) => [i.attemptId, i]));
  const signalsBy = new Map(signals.map((e) => [e.attemptId, e]));

  // Enrolled students with no real attempt yet: who still has to show up.
  const started = new Set(rows.map((r) => r.userId));
  const roster = await db
    .select({ userId: enrollments.userId, name: profiles.fullName, email: profiles.email })
    .from(enrollments)
    .innerJoin(profiles, eq(profiles.id, enrollments.userId))
    .where(and(eq(enrollments.courseId, exam.courseId), eq(enrollments.role, "student"), isNull(profiles.deactivatedAt)))
    .orderBy(asc(profiles.fullName), asc(profiles.email));

  return {
    exam: { id: exam.id, title: exam.title, state: exam.state },
    now: new Date().toISOString(),
    notStarted: roster.filter((r) => !started.has(r.userId)),
    attempts: rows.map((r) => {
      const i = itemsBy.get(r.id);
      const e = signalsBy.get(r.id);
      return {
        ...r,
        startedAt: r.startedAt.toISOString(),
        deadlineAt: r.deadlineAt?.toISOString() ?? null,
        total: i?.total ?? 0,
        answered: i?.answered ?? 0,
        lastSaved: i?.lastSaved ? new Date(i.lastSaved).toISOString() : null,
        blurs: e?.blurs ?? 0,
        pastes: e?.pastes ?? 0,
      };
    }),
  };
}

/** Extensions that apply to this exam: its own, plus a student's all-exams accommodations. */
export async function listExtensions(scope: Scope, examId: string) {
  const exam = await getExam(scope, examId);
  if (!exam) return [];
  return db
    .select({
      id: extensions.id,
      userId: extensions.userId,
      name: profiles.fullName,
      email: profiles.email,
      kind: extensions.kind,
      value: extensions.value,
      reason: extensions.reason,
      examId: extensions.examId,
      createdAt: extensions.createdAt,
    })
    .from(extensions)
    .innerJoin(profiles, eq(profiles.id, extensions.userId))
    .innerJoin(enrollments, and(eq(enrollments.userId, extensions.userId), eq(enrollments.courseId, exam.courseId)))
    .where(and(eq(extensions.orgId, scope.orgId), or(isNull(extensions.examId), eq(extensions.examId, examId))))
    .orderBy(desc(extensions.createdAt));
}

async function recomputeDeadlines(tx: Tx, exam: typeof exams.$inferSelect | null, userId: string) {
  const live = await tx
    .select({ id: attempts.id, startedAt: attempts.startedAt, examId: attempts.examId, settings: exams.settings })
    .from(attempts)
    .innerJoin(exams, eq(exams.id, attempts.examId))
    .where(and(eq(attempts.userId, userId), eq(attempts.state, "in_progress"), exam ? eq(attempts.examId, exam.id) : undefined));
  for (const a of live) {
    const all = await tx
      .select({ kind: extensions.kind, value: extensions.value })
      .from(extensions)
      .where(and(eq(extensions.userId, userId), or(isNull(extensions.examId), eq(extensions.examId, a.examId))));
    const limit = examSettingsSchema.parse(a.settings).timeLimitMinutes;
    await tx.update(attempts).set({ deadlineAt: computeDeadline(a.startedAt, limit, all) }).where(eq(attempts.id, a.id));
  }
}

const extensionInput = z.object({
  examId: z.guid(),
  userId: z.guid(),
  kind: z.enum(["multiplier", "minutes"]),
  value: z.number(),
  reason: z.string(),
  allExams: z.boolean().default(false),
});

/**
 * Grant extra time. A student mid-exam gets their deadline recomputed
 * immediately. "All exams" is a standing accommodation and is admin-only.
 */
export async function addExtension(user: CurrentUser, raw: unknown): Promise<ActionResult> {
  const parsed = extensionInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Some fields are invalid." };
  const input = parsed.data;
  if (!Number.isFinite(input.value) || (input.kind === "multiplier" ? input.value < 1 || input.value > 5 : input.value < -240 || input.value > 600)) {
    return { ok: false, error: input.kind === "multiplier" ? "A multiplier must be between 1 and 5." : "Extra minutes must be between −240 and 600." };
  }
  if (!input.reason.trim()) return { ok: false, error: "Give a reason. It goes in the audit log." };
  if (input.allExams && user.role !== "admin") return { ok: false, error: "Only an administrator can grant time on every exam." };
  const exam = await getExam(await scopeFor(user), input.examId);
  if (!exam) return { ok: false, error: "That exam no longer exists." };
  const [student] = await db
    .select({ id: enrollments.userId })
    .from(enrollments)
    .where(and(eq(enrollments.userId, input.userId), eq(enrollments.courseId, exam.courseId), eq(enrollments.role, "student")))
    .limit(1);
  if (!student) return { ok: false, error: "That person isn't a student in this course." };

  await db.transaction(async (tx) => {
    const [ext] = await tx
      .insert(extensions)
      .values({
        orgId: user.orgId,
        userId: input.userId,
        examId: input.allExams ? null : input.examId,
        kind: input.kind,
        value: input.value,
        reason: input.reason.trim(),
        createdBy: user.id,
      })
      .returning({ id: extensions.id });
    await recomputeDeadlines(tx, input.allExams ? null : exam, input.userId);
    await writeAudit(
      {
        orgId: user.orgId,
        actorId: user.id,
        action: "extension.add",
        entityType: "exam",
        entityId: input.examId,
        after: { userId: input.userId, kind: input.kind, value: input.value, allExams: input.allExams, extensionId: ext.id },
        reason: input.reason.trim(),
      },
      tx,
    );
  });
  return { ok: true };
}

export async function removeExtension(user: CurrentUser, input: { examId: string; extensionId: string; reason: string }): Promise<ActionResult> {
  if (!z.guid().safeParse(input.extensionId).success) return { ok: false, error: "That extension no longer exists." };
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : "";
  if (!reason) return { ok: false, error: "Give a reason. It goes in the audit log." };
  const scope = await scopeFor(user);
  const exam = await getExam(scope, input.examId);
  if (!exam) return { ok: false, error: "That exam no longer exists." };
  const [ext] = await db.select().from(extensions).where(and(eq(extensions.id, input.extensionId), eq(extensions.orgId, user.orgId))).limit(1);
  if (!ext || (ext.examId !== null && ext.examId !== exam.id)) return { ok: false, error: "That extension no longer exists." };
  if (ext.examId === null && user.role !== "admin") return { ok: false, error: "Only an administrator can remove an all-exams accommodation." };

  await db.transaction(async (tx) => {
    await tx.delete(extensions).where(eq(extensions.id, ext.id));
    await recomputeDeadlines(tx, ext.examId ? exam : null, ext.userId);
    await writeAudit(
      {
        orgId: user.orgId,
        actorId: user.id,
        action: "extension.remove",
        entityType: "exam",
        entityId: exam.id,
        before: { userId: ext.userId, kind: ext.kind, value: ext.value, allExams: ext.examId === null, reason: ext.reason },
        reason,
      },
      tx,
    );
  });
  return { ok: true };
}

export async function setSchedule(
  user: CurrentUser,
  input: { examId: string; opensAt: string | null; closesAt: string | null },
): Promise<ActionResult> {
  const exam = await getExam(await scopeFor(user), input.examId);
  if (!exam) return { ok: false, error: "That exam no longer exists." };
  const opens = input.opensAt ? new Date(input.opensAt) : null;
  const closes = input.closesAt ? new Date(input.closesAt) : null;
  if ((opens && Number.isNaN(opens.getTime())) || (closes && Number.isNaN(closes.getTime()))) return { ok: false, error: "That date isn't valid." };
  if (opens && closes && closes <= opens) return { ok: false, error: "The exam must close after it opens." };
  await db.update(exams).set({ opensAt: opens, closesAt: closes }).where(eq(exams.id, exam.id));
  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    action: "exam.schedule",
    entityType: "exam",
    entityId: exam.id,
    before: { opensAt: exam.opensAt, closesAt: exam.closesAt },
    after: { opensAt: opens, closesAt: closes },
  });
  return { ok: true };
}

/** All real attempts for the results table and the CSV. */
export async function listExamAttempts(scope: Scope, examId: string) {
  const exam = await getExam(scope, examId);
  if (!exam) return [];
  await sweepExpired(exam);
  return db
    .select({
      id: attempts.id,
      userId: attempts.userId,
      name: profiles.fullName,
      email: profiles.email,
      state: attempts.state,
      score: attempts.score,
      maxScore: attempts.maxScore,
      seed: attempts.seed,
      startedAt: attempts.startedAt,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(profiles, eq(profiles.id, attempts.userId))
    .innerJoin(exams, eq(exams.id, attempts.examId))
    .where(and(eq(attempts.examId, examId), eq(attempts.isPreview, false)))
    .orderBy(asc(profiles.email), asc(attempts.startedAt));
}

/** The summary CSV: every real attempt with its extra time and integrity signals. */
export async function listExportSummary(scope: Scope, examId: string): Promise<SummaryInput[]> {
  const [rows, exts, signals] = await Promise.all([
    listExamAttempts(scope, examId),
    listExtensions(scope, examId),
    db
      .select({
        attemptId: events.attemptId,
        blurs: sql<number>`count(*) filter (where ${events.type} = 'blur')::int`,
        pastes: sql<number>`count(*) filter (where ${events.type} = 'paste')::int`,
      })
      .from(events)
      .innerJoin(attempts, eq(attempts.id, events.attemptId))
      .where(and(eq(attempts.examId, examId), eq(attempts.isPreview, false)))
      .groupBy(events.attemptId),
  ]);
  const sig = new Map(signals.map((e) => [e.attemptId, e]));
  return rows.map((r) => ({
    attemptId: r.id,
    name: r.name,
    email: r.email,
    state: r.state,
    score: r.score,
    maxScore: r.maxScore,
    startedAt: r.startedAt,
    submittedAt: r.submittedAt,
    seed: r.seed,
    extensions: exts.filter((e) => e.userId === r.userId),
    blurs: sig.get(r.id)?.blurs ?? 0,
    pastes: sig.get(r.id)?.pastes ?? 0,
  }));
}

/** The per-answer CSV: one row per question per real attempt. */
export async function listExportItems(scope: Scope, examId: string): Promise<ItemInput[]> {
  const exam = await getExam(scope, examId);
  if (!exam) return [];
  await sweepExpired(exam);
  const rows = await db
    .select({
      attemptId: attempts.id,
      name: profiles.fullName,
      email: profiles.email,
      position: attemptItems.position,
      def: questionVersions.def,
      topic: topics.name,
      version: questionVersions.version,
      score: grades.score,
      max: grades.max,
      gradedBy: grades.gradedBy,
      needsReview: grades.needsReview,
      overrideReason: grades.overrideReason,
    })
    .from(attemptItems)
    .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
    .innerJoin(profiles, eq(profiles.id, attempts.userId))
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .leftJoin(topics, eq(topics.id, questions.topicId))
    .leftJoin(grades, eq(grades.attemptItemId, attemptItems.id))
    .where(and(eq(attempts.examId, examId), eq(attempts.isPreview, false)))
    .orderBy(asc(profiles.email), asc(attempts.startedAt), asc(attemptItems.position));
  return rows.map(({ def, ...r }) => ({ ...r, question: questionLabel(def, 200) }));
}

/** One student's whole attempt: what they saw, said, and how it was scored. */
export async function loadAttemptDetail(scope: Scope, examId: string, attemptId: string) {
  const [row] = await db
    .select({ attempt: attempts, exam: exams, name: profiles.fullName, email: profiles.email })
    .from(attempts)
    .innerJoin(exams, eq(exams.id, attempts.examId))
    .innerJoin(profiles, eq(profiles.id, attempts.userId))
    .where(and(eq(attempts.id, attemptId), eq(exams.id, examId), eq(exams.orgId, scope.orgId), inScope(exams.courseId, scope)))
    .limit(1);
  if (!row) return null;

  const items = await db
    .select({
      id: attemptItems.id,
      position: attemptItems.position,
      instance: attemptItems.instance,
      questionVersionId: attemptItems.questionVersionId,
      seedVersionId: attemptItems.seedVersionId,
      version: questionVersions.version,
      type: questionVersions.type,
      def: questionVersions.def,
      response: responses.response,
      score: grades.score,
      max: grades.max,
      lines: grades.lines,
      gradedBy: grades.gradedBy,
      needsReview: grades.needsReview,
      overrideReason: grades.overrideReason,
      topicId: topics.id,
      topicName: topics.name,
    })
    .from(attemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .leftJoin(topics, eq(topics.id, questions.topicId))
    .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
    .leftJoin(grades, eq(grades.attemptItemId, attemptItems.id))
    .where(eq(attemptItems.attemptId, attemptId))
    .orderBy(asc(attemptItems.position));

  const signals = await db
    .select({ type: events.type, n: count() })
    .from(events)
    .where(eq(events.attemptId, attemptId))
    .groupBy(events.type);

  const reproduction = await reproduce(row.exam, row.attempt, items);

  return {
    attempt: row.attempt,
    exam: row.exam,
    student: row.name ?? row.email,
    items: items.map((i) => ({ ...i, key: getQuestionType(i.type).keyResponse(i.instance), label: questionLabel(i.def, 90), vars: varsFor(row.attempt.seed, i) })),
    signals: Object.fromEntries(signals.map((s) => [s.type, s.n])),
    reproduction,
    mastery: topicMastery(items.map((i) => ({ topicId: i.topicId, topicName: i.topicName, score: i.score ?? 0, max: i.max ?? 0, needsReview: i.needsReview ?? false }))),
  };
}

/**
 * The variable values behind one item, re-derived from its seed. Generation is
 * pure, so nothing extra has to be stored; the stored instance stays the record.
 */
function varsFor(attemptSeed: string, i: { type: string; def: unknown; seedVersionId: string }): Record<string, string | number | boolean> {
  try {
    const type = getQuestionType(i.type);
    return type.generate(type.defSchema.parse(i.def), createRng(questionSeed(attemptSeed, i.seedVersionId))).vars;
  } catch {
    return {};
  }
}

/** "Reproduce": rebuild the exam from the seed and compare with what was stored. */
async function reproduce(
  exam: typeof exams.$inferSelect,
  attempt: typeof attempts.$inferSelect,
  stored: { position: number; questionVersionId: string; seedVersionId: string; version: number; type: string; instance: unknown; def: unknown }[],
) {
  const blueprint = blueprintSchema.safeParse(exam.blueprint);
  if (!blueprint.success) return null;
  // A preview of a draft was built from live questions; there is nothing locked to rebuild from.
  const pool = exam.lockedVersions
    ? await lockedPool(exam)
    : attempt.isPreview
      ? await loadPool(exam.orgId, exam.courseId)
      : [];
  if (pool.length === 0) return null;

  const topicIds = [...new Set(blueprint.data.sections.map((s) => s.topicId))];
  try {
    const built = buildAttempt(attempt.seed, blueprint.data, pool);
    const names = Object.fromEntries(stored.map((s) => [s.seedVersionId, questionLabel(s.def, 60)]));
    const topicRows = topicIds.length ? await db.select({ id: topics.id, name: topics.name }).from(topics).where(inArray(topics.id, topicIds)) : [];
    const byQ = Object.fromEntries(built.items.map((i) => [i.questionId, names[i.versionId] ?? i.questionId]));
    return {
      ...compareReproduction({ attemptSeed: attempt.seed, stored, rebuilt: built.items }),
      explanation: explainSelection(built.trace, blueprint.data, { questions: byQ, topics: Object.fromEntries(topicRows.map((t) => [t.id, t.name])) }),
    };
  } catch {
    return { identical: false, differences: ["The exam could not be rebuilt from this seed."], notes: [] as string[], explanation: [] as string[] };
  }
}

/**
 * Everything staff did to one exam, newest first: entries filed against the
 * exam itself plus those against its attempts and answers (marking, score
 * changes, attempts ended at close), with the student they concern.
 */
export async function listExamHistory(scope: Scope, examId: string, limit = 40) {
  const exam = await getExam(scope, examId);
  if (!exam) return [];
  const attemptIds = db.select({ id: sql<string>`${attempts.id}::text` }).from(attempts).where(eq(attempts.examId, examId));
  const itemIds = db
    .select({ id: sql<string>`${attemptItems.id}::text` })
    .from(attemptItems)
    .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
    .where(eq(attempts.examId, examId));
  const rows = await db
    .select({
      id: auditLog.id,
      ts: auditLog.ts,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      before: auditLog.before,
      after: auditLog.after,
      reason: auditLog.reason,
      actor: profiles.fullName,
      actorEmail: profiles.email,
    })
    .from(auditLog)
    .leftJoin(profiles, eq(profiles.id, auditLog.actorId))
    .where(
      and(
        eq(auditLog.orgId, scope.orgId),
        or(
          and(eq(auditLog.entityType, "exam"), eq(auditLog.entityId, examId)),
          and(eq(auditLog.entityType, "attempt"), inArray(auditLog.entityId, attemptIds)),
          and(eq(auditLog.entityType, "attempt_item"), inArray(auditLog.entityId, itemIds)),
        ),
      ),
    )
    .orderBy(desc(auditLog.ts), desc(auditLog.id))
    .limit(limit);

  // Name the student for entries about one attempt or answer.
  const aIds = rows.filter((r) => r.entityType === "attempt").map((r) => r.entityId);
  const iIds = rows.filter((r) => r.entityType === "attempt_item").map((r) => r.entityId);
  const who = new Map<string, string>();
  if (aIds.length) {
    const found = await db
      .select({ id: attempts.id, name: profiles.fullName, email: profiles.email })
      .from(attempts)
      .innerJoin(profiles, eq(profiles.id, attempts.userId))
      .where(inArray(attempts.id, aIds));
    for (const f of found) who.set(f.id, f.name ?? f.email);
  }
  if (iIds.length) {
    const found = await db
      .select({ id: attemptItems.id, position: attemptItems.position, name: profiles.fullName, email: profiles.email })
      .from(attemptItems)
      .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
      .innerJoin(profiles, eq(profiles.id, attempts.userId))
      .where(inArray(attemptItems.id, iIds));
    for (const f of found) who.set(f.id, `${f.name ?? f.email}, question ${f.position + 1}`);
  }
  return rows.map((r) => ({ ...r, subject: r.entityType === "exam" ? null : (who.get(r.entityId) ?? null) }));
}
