import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attemptItems, attempts, exams, grades, questionVersions, responses } from "@/db/schema";
import { isExpired, secondsLeft } from "@/engine/attempts/deadline";
import { effectiveState } from "@/engine/exam-state";
import { finalizeAttempt } from "@/engine/attempts/finalize";
import { writeAudit } from "@/server/authoring/audit";
import { getQuestionType } from "@/question-types/registry";
import type { CurrentUser } from "@/server/auth";

/** The exam's scheduled end has passed while it was still marked open. */
export function windowClosed(exam: typeof exams.$inferSelect, now: Date) {
  return exam.state !== "closed" && effectiveState(exam, now) === "closed";
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
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, attemptId)).for("update").limit(1);
    if (!attempt || attempt.state !== "in_progress") return attempt ?? null;

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
    for (const item of result.items) {
      await tx
        .insert(grades)
        .values({ attemptItemId: item.id, score: item.score, max: item.max, lines: item.lines, needsReview: item.needsReview })
        .onConflictDoUpdate({
          target: grades.attemptItemId,
          set: { score: item.score, max: item.max, lines: item.lines, needsReview: item.needsReview },
        });
    }
    const [updated] = await tx
      .update(attempts)
      .set({
        state: result.needsReview ? "submitted" : "graded",
        submittedAt: new Date(),
        score: result.score,
        maxScore: result.max,
      })
      .where(eq(attempts.id, attemptId))
      .returning();
    if (actorId && reason !== "submit") {
      await writeAudit(
        { orgId: attempt.orgId, actorId, action: `attempt.${reason}`, entityType: "attempt", entityId: attemptId },
        tx,
      );
    }
    return updated;
  });
}

/** Everything the exam-taking screen needs. Instances are redacted: no answer keys. */
export async function loadAttemptForTaking(user: CurrentUser, attemptId: string) {
  const own = await getOwnAttempt(user, attemptId);
  if (!own) return null;
  const { attempt, exam } = own;
  const now = new Date();

  if (attempt.state === "in_progress" && !attempt.isPreview && (isExpired(attempt.deadlineAt, now) || windowClosed(exam, now))) {
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
      type: questionVersions.type,
      response: responses.response,
      seq: responses.seq,
    })
    .from(attemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
    .where(eq(attemptItems.attemptId, attempt.id))
    .orderBy(asc(attemptItems.position));

  return {
    finished: false as const,
    examId: exam.id,
    title: exam.title,
    isPreview: attempt.isPreview,
    oneWay: (exam.settings as { oneWayNavigation?: boolean }).oneWayNavigation === true,
    deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
    serverNow: now.toISOString(),
    secondsLeft: secondsLeft(attempt.deadlineAt, now),
    items: rows.map((r) => ({
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
