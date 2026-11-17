import "server-only";
import { and, asc, eq, isNotNull, max, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { attemptItems, attempts, exams, extensions, grades, questionVersions, responses } from "@/db/schema";
import { effectiveItemTime, hardDeadline, isExpired, itemDeadline, secondsLeft } from "@/engine/attempts/deadline";
import { lateness, type LatePenalty, penaltyFor } from "@/engine/attempts/late";
import { examSettingsSchema } from "@/engine/exam";
import { effectiveState } from "@/engine/exam-state";
import { finalizeAttempt } from "@/engine/attempts/finalize";
import { writeAudit } from "@/server/authoring/audit";
import { ensureTypesReady, getQuestionType } from "@/question-types/registry";
import { appendAdaptiveStep } from "./adaptive";
import type { CurrentUser } from "@/server/auth";

/** The exam's scheduled end has passed while it was still marked open. */
export function windowClosed(exam: typeof exams.$inferSelect, now: Date) {
  return exam.state !== "closed" && effectiveState(exam, now) === "closed";
}

/** Whether an attempt's time (including any late window) is over. */
export function attemptExpired(a: Pick<typeof attempts.$inferSelect, "deadlineAt" | "lateWindowMinutes">, now: Date) {
  return isExpired(hardDeadline(a.deadlineAt, a.lateWindowMinutes), now);
}

/** An attempt the user owns, or null. Staff previews are owned by the staff user. */
export async function getOwnAttempt(user: CurrentUser, attemptId: string) {
  const [row] = await db
    .select({ attempt: attempts, exam: exams })
    .from(attempts)
    .innerJoin(exams, eq(exams.id, attempts.examId))
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, user.id), eq(attempts.orgId, user.orgId)))
    .limit(1);
  return row ?? null;
}

/**
 * Grade a finished attempt from its frozen instances and store the result.
 * Safe to call twice: only an in-progress attempt is finalized. Used by manual
 * submit, by the deadline, and when an exam is closed.
 */
export async function finalizeStoredAttempt(attemptId: string, actorId?: string, reason = "submit") {
  // Before the transaction: loading the code sandbox mustn't hold row locks.
  await ensureTypesReady();
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, attemptId)).for("update").limit(1);
    if (!attempt || attempt.state !== "in_progress") return attempt ?? null;
    // An adaptive attempt ended early: the questions it didn't reach are drawn
    // now and count as unanswered, so stopping early never shrinks the total.
    if (attempt.plan) while (await appendAdaptiveStep(tx, attempt, null));

    const rows = await tx
      .select({
        id: attemptItems.id,
        instance: attemptItems.instance,
        type: questionVersions.type,
        points: questionVersions.points,
        response: responses.response,
      })
      .from(attemptItems)
      .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
      .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
      .where(eq(attemptItems.attemptId, attemptId))
      .orderBy(asc(attemptItems.position));

    const result = finalizeAttempt(rows.map((r) => ({ ...r, response: r.response ?? null })));

    // Late work under an "accept" policy: measured when the student submitted,
    // or (if time ran out) at their last saved change, never past the window.
    let late: LatePenalty | null = null;
    if (attempt.lateWindowMinutes > 0 && attempt.deadlineAt) {
      const [exam] = await tx.select({ settings: exams.settings }).from(exams).where(eq(exams.id, attempt.examId)).limit(1);
      const policy = examSettingsSchema.parse(exam?.settings ?? {}).late;
      const [last] = await tx
        .select({ at: max(responses.updatedAt) })
        .from(responses)
        .innerJoin(attemptItems, eq(attemptItems.id, responses.attemptItemId))
        .where(eq(attemptItems.attemptId, attemptId));
      const hard = hardDeadline(attempt.deadlineAt, attempt.lateWindowMinutes)!;
      const now = new Date();
      const at = reason === "submit" ? now : (last?.at ?? now);
      late = penaltyFor(policy, lateness(attempt.deadlineAt, at < hard ? at : hard), result.score);
    }
    if (result.items.length > 0) {
      await tx
        .insert(grades)
        .values(result.items.map((item) => ({ attemptItemId: item.id, score: item.score, max: item.max, lines: item.lines, needsReview: item.needsReview })))
        .onConflictDoUpdate({
          target: grades.attemptItemId,
          set: {
            score: sql`excluded.score`,
            max: sql`excluded.max`,
            lines: sql`excluded.lines`,
            needsReview: sql`excluded.needs_review`,
          },
        });
    }
    const [updated] = await tx
      .update(attempts)
      .set({
        state: result.needsReview ? "submitted" : "graded",
        submittedAt: new Date(),
        score: late ? Math.round((result.score - late.points) * 10_000) / 10_000 : result.score,
        maxScore: result.max,
        latePenalty: late,
      })
      .where(eq(attempts.id, attemptId))
      .returning();
    if (actorId && reason !== "submit") {
      await writeAudit(
        {
          orgId: attempt.orgId,
          actorId,
          action: `attempt.${reason}`,
          entityType: "attempt",
          entityId: attemptId,
          before: { state: attempt.state, deadlineAt: attempt.deadlineAt },
          after: { state: updated.state, score: updated.score, maxScore: updated.maxScore },
        },
        tx,
      );
    }
    return updated;
  });
}

/** Finalize several attempts, a few at a time so the connection pool isn't exhausted. */
export async function finalizeMany(ids: string[], actorId?: string, reason = "submit") {
  for (let i = 0; i < ids.length; i += 3) {
    await Promise.all(ids.slice(i, i + 3).map((id) => finalizeStoredAttempt(id, actorId, reason)));
  }
}

/**
 * Finish attempts whose time ran out while nobody was looking: the student's
 * deadline passed, or the exam's scheduled window closed. There is no
 * background job; pages that show attempts call this first. Idempotent.
 */
export async function sweepExpired(exam: typeof exams.$inferSelect) {
  const now = new Date();
  const closed = windowClosed(exam, now);
  const overdue = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.examId, exam.id),
        eq(attempts.state, "in_progress"),
        eq(attempts.isPreview, false),
        closed
          ? undefined
          : and(isNotNull(attempts.deadlineAt), sql`${attempts.deadlineAt} + make_interval(mins => ${attempts.lateWindowMinutes}) < ${now.toISOString()}::timestamptz`),
      ),
    )
    .limit(200);
  await finalizeMany(overdue.map((a) => a.id));
  return overdue.length;
}

/**
 * The attempt's current deadline, read fresh: staff may have granted extra time
 * since the screen loaded. Ends the attempt if its time (or the exam window)
 * is up, exactly as loading the screen would.
 */
export async function attemptClock(user: CurrentUser, attemptId: string) {
  const own = await getOwnAttempt(user, attemptId);
  if (!own) return { finished: true as const };
  const { attempt, exam } = own;
  const now = new Date();
  if (attempt.state !== "in_progress") return { finished: true as const };
  if (!attempt.isPreview && (attemptExpired(attempt, now) || windowClosed(exam, now))) {
    await finalizeStoredAttempt(attempt.id);
    return { finished: true as const };
  }
  return {
    finished: false as const,
    deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
    hardDeadlineAt: hardDeadline(attempt.deadlineAt, attempt.lateWindowMinutes)?.toISOString() ?? null,
    serverNow: now.toISOString(),
  };
}

/** Everything the exam-taking screen needs. Instances are redacted: no answer keys. */
export async function loadAttemptForTaking(user: CurrentUser, attemptId: string) {
  const own = await getOwnAttempt(user, attemptId);
  if (!own) return null;
  const { attempt, exam } = own;
  const now = new Date();

  if (attempt.state === "in_progress" && !attempt.isPreview && (attemptExpired(attempt, now) || windowClosed(exam, now))) {
    await finalizeStoredAttempt(attempt.id);
    return { finished: true as const, examId: exam.id };
  }
  if (attempt.state !== "in_progress") return { finished: true as const, examId: exam.id };

  const rows = await db
    .select({
      id: attemptItems.id,
      position: attemptItems.position,
      instance: attemptItems.instance,
      flagged: attemptItems.flagged,
      openedAt: attemptItems.openedAt,
      type: questionVersions.type,
      response: responses.response,
      seq: responses.seq,
    })
    .from(attemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
    .where(eq(attemptItems.attemptId, attempt.id))
    .orderBy(asc(attemptItems.position));

  const settings = examSettingsSchema.parse(exam.settings);
  const itemTime = await itemSeconds(attempt, settings.questionTimeLimitSeconds);
  // Sequential attempts get only what the student has reached; the rest stays on the server.
  const visible = attempt.cursor === null ? rows : rows.filter((r) => r.position <= attempt.cursor!);
  const current = attempt.cursor === null ? null : rows.find((r) => r.position === attempt.cursor);

  return {
    finished: false as const,
    examId: exam.id,
    title: exam.title,
    isPreview: attempt.isPreview,
    oneWay: attempt.cursor !== null || settings.oneWayNavigation,
    cursor: attempt.cursor,
    // Adaptive attempts create questions as they go; the plan says how many there will be.
    total: attempt.plan ? (attempt.plan as { length: number }).length : rows.length,
    deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
    hardDeadlineAt: hardDeadline(attempt.deadlineAt, attempt.lateWindowMinutes)?.toISOString() ?? null,
    itemDeadlineAt: itemDeadline(current?.openedAt ?? null, itemTime)?.toISOString() ?? null,
    serverNow: now.toISOString(),
    secondsLeft: secondsLeft(attempt.deadlineAt, now),
    items: visible.map((r) => ({
      id: r.id,
      type: r.type,
      instance: getQuestionType(r.type).redact(r.instance),
      response: r.response ?? null,
      /** Last stored autosave sequence; the client continues from here after a resume. */
      seq: r.seq ?? 0,
      flagged: r.flagged,
    })),
  };

}

/** Seconds this student gets per question (with their accommodations), or null when untimed. */
async function itemSeconds(attempt: typeof attempts.$inferSelect, limit: number | null, reader: Pick<typeof db, "select"> = db) {
  if (limit === null) return null;
  const exts = await reader
    .select({ kind: extensions.kind, value: extensions.value })
    .from(extensions)
    .where(and(eq(extensions.userId, attempt.userId), sql`(${extensions.examId} is null or ${extensions.examId} = ${attempt.examId})`));
  return effectiveItemTime(limit, exts)?.seconds ?? null;
}

export type AdvanceResult =
  | { ok: true; done: true }
  | { ok: true; done: false; cursor: number; item: { id: string; type: string; instance: unknown; response: unknown; seq: number; flagged: boolean }; itemDeadlineAt: string | null }
  | { ok: false; error: string; closed?: true };

/**
 * Move a sequential attempt to the next question: the current one locks, the
 * next opens now. Idempotent: a repeated or late request from an older
 * position just returns where the attempt already is.
 */
export async function advanceAttempt(user: CurrentUser, attemptId: string, fromPosition: number): Promise<AdvanceResult> {
  await ensureTypesReady(); // adaptive steps grade the answer, code questions included
  const own = await getOwnAttempt(user, attemptId);
  if (!own) return { ok: false, error: "That attempt doesn't exist." };
  const now = new Date();
  if (own.attempt.state !== "in_progress") return { ok: false, error: "This attempt has ended.", closed: true };
  if (attemptExpired(own.attempt, now) || (!own.attempt.isPreview && windowClosed(own.exam, now))) {
    await finalizeStoredAttempt(attemptId);
    return { ok: false, error: "This attempt has ended.", closed: true };
  }
  const settings = examSettingsSchema.parse(own.exam.settings);

  return db.transaction(async (tx): Promise<AdvanceResult> => {
    const [a] = await tx.select().from(attempts).where(eq(attempts.id, attemptId)).for("update").limit(1);
    if (!a || a.cursor === null) return { ok: false, error: "This exam lets you move freely between questions." };
    const items = await tx
      .select({ id: attemptItems.id, position: attemptItems.position })
      .from(attemptItems)
      .where(eq(attemptItems.attemptId, attemptId))
      .orderBy(asc(attemptItems.position));
    let cursor = a.cursor;
    const total = a.plan ? (a.plan as { length: number }).length : items.length;
    if (cursor === fromPosition) {
      // Adaptive: choose and create the next question from this answer first.
      if (a.plan && cursor + 1 < total && items.length === cursor + 1 && !(await appendAdaptiveStep(tx, a, null))) {
        await tx.update(attemptItems).set({ lockedAt: now }).where(and(eq(attemptItems.attemptId, attemptId), eq(attemptItems.position, cursor)));
        return { ok: true, done: true };
      }
      await tx.update(attemptItems).set({ lockedAt: now }).where(and(eq(attemptItems.attemptId, attemptId), eq(attemptItems.position, cursor)));
      if (cursor + 1 >= total) return { ok: true, done: true };
      cursor += 1;
      await tx.update(attempts).set({ cursor }).where(eq(attempts.id, attemptId));
      await tx
        .update(attemptItems)
        .set({ openedAt: now })
        .where(and(eq(attemptItems.attemptId, attemptId), eq(attemptItems.position, cursor), sql`${attemptItems.openedAt} is null`));
    } else if (cursor + 1 >= total && fromPosition >= cursor) {
      return { ok: true, done: true };
    }
    const [row] = await tx
      .select({
        id: attemptItems.id,
        type: questionVersions.type,
        instance: attemptItems.instance,
        flagged: attemptItems.flagged,
        openedAt: attemptItems.openedAt,
        response: responses.response,
        seq: responses.seq,
      })
      .from(attemptItems)
      .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
      .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
      .where(and(eq(attemptItems.attemptId, attemptId), eq(attemptItems.position, cursor)))
      .limit(1);
    const seconds = await itemSeconds(a, settings.questionTimeLimitSeconds, tx);
    return {
      ok: true,
      done: false,
      cursor,
      item: { id: row.id, type: row.type, instance: getQuestionType(row.type).redact(row.instance), response: row.response ?? null, seq: row.seq ?? 0, flagged: row.flagged },
      itemDeadlineAt: itemDeadline(row.openedAt, seconds)?.toISOString() ?? null,
    };
  });
}
