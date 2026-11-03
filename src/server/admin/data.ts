import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attemptItems,
  attempts,
  auditLog,
  events,
  exams,
  extensions,
  grades,
  profiles,
  questionVersions,
  responses,
  topics,
} from "@/db/schema";
import { buildAttempt } from "@/engine/attempt";
import { computeDeadline } from "@/engine/attempts/deadline";
import { examSettingsSchema } from "@/engine/exam";
import { compareReproduction } from "@/engine/regrade";
import { explainSelection } from "@/engine/selection/explain";
import { blueprintSchema } from "@/engine/selection/types";
import { questionLabel } from "@/lib/question-label";
import { getQuestionType } from "@/question-types/registry";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";
import { getExam, loadPool } from "@/server/authoring/data";
import type { ActionResult } from "@/server/authoring/questions";
import { lockedPool } from "@/server/attempts/start";

export async function listAdminExams(orgId: string) {
  return db
    .select({
      id: exams.id,
      title: exams.title,
      state: exams.state,
      attempts: sql<number>`(select count(*)::int from ${attempts} where ${attempts.examId} = ${exams.id} and not ${attempts.isPreview})`,
      inProgress: sql<number>`(select count(*)::int from ${attempts} where ${attempts.examId} = ${exams.id} and not ${attempts.isPreview} and ${attempts.state} = 'in_progress')`,
    })
    .from(exams)
    .where(and(eq(exams.orgId, orgId), sql`${exams.state} <> 'draft'`))
    .orderBy(desc(exams.updatedAt));
}

/** Everyone who has started the exam, with progress and integrity signals. */
export async function loadLive(orgId: string, examId: string) {
  const exam = await getExam(orgId, examId);
  if (!exam) return null;

  const rows = await db
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
      total: sql<number>`(select count(*)::int from ${attemptItems} where ${attemptItems.attemptId} = ${attempts.id})`,
      answered: sql<number>`(select count(*)::int from ${responses} join ${attemptItems} on ${attemptItems.id} = ${responses.attemptItemId} where ${attemptItems.attemptId} = ${attempts.id})`,
      lastSaved: sql<Date | null>`(select max(${responses.updatedAt}) from ${responses} join ${attemptItems} on ${attemptItems.id} = ${responses.attemptItemId} where ${attemptItems.attemptId} = ${attempts.id})`,
      blurs: sql<number>`(select count(*)::int from ${events} where ${events.attemptId} = ${attempts.id} and ${events.type} = 'blur')`,
      pastes: sql<number>`(select count(*)::int from ${events} where ${events.attemptId} = ${attempts.id} and ${events.type} = 'paste')`,
    })
    .from(attempts)
    .innerJoin(profiles, eq(profiles.id, attempts.userId))
    .where(and(eq(attempts.examId, examId), eq(attempts.isPreview, false)))
    .orderBy(desc(attempts.startedAt));

  return {
    exam: { id: exam.id, title: exam.title, state: exam.state },
    now: new Date().toISOString(),
    attempts: rows.map((r) => ({
      ...r,
      startedAt: r.startedAt.toISOString(),
      deadlineAt: r.deadlineAt?.toISOString() ?? null,
      lastSaved: r.lastSaved ? new Date(r.lastSaved).toISOString() : null,
    })),
  };
}

export async function listExtensions(orgId: string, examId: string) {
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
    })
    .from(extensions)
    .innerJoin(profiles, eq(profiles.id, extensions.userId))
    .where(and(eq(extensions.orgId, orgId), or(isNull(extensions.examId), eq(extensions.examId, examId))))
    .orderBy(desc(extensions.createdAt));
}

/** Grant extra time. A student mid-exam gets their deadline recomputed immediately. */
export async function addExtension(
  user: CurrentUser,
  input: { examId: string; userId: string; kind: "multiplier" | "minutes"; value: number; reason: string },
): Promise<ActionResult> {
  if (!Number.isFinite(input.value) || (input.kind === "multiplier" ? input.value < 1 || input.value > 5 : input.value < -240 || input.value > 600)) {
    return { ok: false, error: input.kind === "multiplier" ? "A multiplier must be between 1 and 5." : "Extra minutes must be between −240 and 600." };
  }
  if (!input.reason.trim()) return { ok: false, error: "Give a reason. It goes in the audit log." };
  const exam = await getExam(user.orgId, input.examId);
  if (!exam) return { ok: false, error: "That exam no longer exists." };
  const [student] = await db.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.id, input.userId), eq(profiles.orgId, user.orgId))).limit(1);
  if (!student) return { ok: false, error: "That student doesn't exist." };

  const [ext] = await db
    .insert(extensions)
    .values({ orgId: user.orgId, userId: input.userId, examId: input.examId, kind: input.kind, value: input.value, reason: input.reason.trim(), createdBy: user.id })
    .returning({ id: extensions.id });

  const all = await db
    .select({ kind: extensions.kind, value: extensions.value })
    .from(extensions)
    .where(and(eq(extensions.userId, input.userId), or(isNull(extensions.examId), eq(extensions.examId, input.examId))));
  const limit = examSettingsSchema.parse(exam.settings).timeLimitMinutes;
  const live = await db
    .select({ id: attempts.id, startedAt: attempts.startedAt })
    .from(attempts)
    .where(and(eq(attempts.examId, input.examId), eq(attempts.userId, input.userId), eq(attempts.state, "in_progress")));
  for (const a of live) {
    await db.update(attempts).set({ deadlineAt: computeDeadline(a.startedAt, limit, all) }).where(eq(attempts.id, a.id));
  }

  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    action: "extension.add",
    entityType: "exam",
    entityId: input.examId,
    after: { userId: input.userId, kind: input.kind, value: input.value, extensionId: ext.id },
    reason: input.reason.trim(),
  });
  return { ok: true };
}

export async function setSchedule(
  user: CurrentUser,
  input: { examId: string; opensAt: string | null; closesAt: string | null },
): Promise<ActionResult> {
  const exam = await getExam(user.orgId, input.examId);
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
export async function listExamAttempts(orgId: string, examId: string) {
  return db
    .select({
      id: attempts.id,
      name: profiles.fullName,
      email: profiles.email,
      state: attempts.state,
      score: attempts.score,
      maxScore: attempts.maxScore,
      startedAt: attempts.startedAt,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(profiles, eq(profiles.id, attempts.userId))
    .innerJoin(exams, eq(exams.id, attempts.examId))
    .where(and(eq(attempts.examId, examId), eq(exams.orgId, orgId), eq(attempts.isPreview, false)))
    .orderBy(asc(profiles.email), asc(attempts.startedAt));
}

/** One student's whole attempt: what they saw, said, and how it was scored. */
export async function loadAttemptDetail(orgId: string, examId: string, attemptId: string) {
  const [row] = await db
    .select({ attempt: attempts, exam: exams, name: profiles.fullName, email: profiles.email })
    .from(attempts)
    .innerJoin(exams, eq(exams.id, attempts.examId))
    .innerJoin(profiles, eq(profiles.id, attempts.userId))
    .where(and(eq(attempts.id, attemptId), eq(exams.id, examId), eq(exams.orgId, orgId)))
    .limit(1);
  if (!row) return null;

  const items = await db
    .select({
      id: attemptItems.id,
      position: attemptItems.position,
      instance: attemptItems.instance,
      questionVersionId: attemptItems.questionVersionId,
      type: questionVersions.type,
      def: questionVersions.def,
      response: responses.response,
      score: grades.score,
      max: grades.max,
      lines: grades.lines,
      gradedBy: grades.gradedBy,
    })
    .from(attemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
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
    items: items.map((i) => ({ ...i, key: getQuestionType(i.type).keyResponse(i.instance), label: questionLabel(i.def, 90) })),
    signals: Object.fromEntries(signals.map((s) => [s.type, s.n])),
    reproduction,
  };
}

/** "Reproduce": rebuild the exam from the seed and compare with what was stored. */
async function reproduce(
  exam: typeof exams.$inferSelect,
  attempt: typeof attempts.$inferSelect,
  stored: { position: number; questionVersionId: string; instance: unknown; def: unknown }[],
) {
  const blueprint = blueprintSchema.safeParse(exam.blueprint);
  if (!blueprint.success) return null;
  // A preview of a draft was built from live questions; there is nothing locked to rebuild from.
  const pool = exam.lockedVersions
    ? await lockedPool(exam)
    : attempt.isPreview
      ? (await loadPool(exam.orgId)).filter((q) => blueprint.data.sections.some((s) => s.topicId === q.topicId))
      : [];
  if (pool.length === 0) return null;

  const topicIds = [...new Set(blueprint.data.sections.map((s) => s.topicId))];
  try {
    const built = buildAttempt(attempt.seed, blueprint.data, pool);
    const names = Object.fromEntries(stored.map((s) => [s.questionVersionId, questionLabel(s.def, 60)]));
    const topicRows = topicIds.length ? await db.select({ id: topics.id, name: topics.name }).from(topics).where(inArray(topics.id, topicIds)) : [];
    const byQ = Object.fromEntries(built.items.map((i) => [i.questionId, names[i.versionId] ?? i.questionId]));
    return {
      ...compareReproduction({ stored, rebuilt: built.items }),
      explanation: explainSelection(built.trace, blueprint.data, { questions: byQ, topics: Object.fromEntries(topicRows.map((t) => [t.id, t.name])) }),
    };
  } catch {
    return { identical: false, differences: ["The exam could not be rebuilt from this seed."], explanation: [] as string[] };
  }
}

export async function listAudit(orgId: string, page: number, pageSize = 50) {
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
    .where(eq(auditLog.orgId, orgId))
    .orderBy(desc(auditLog.ts), desc(auditLog.id))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

