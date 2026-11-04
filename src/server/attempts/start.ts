import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attemptItems,
  attempts,
  enrollments,
  examCodes,
  exams,
  extensions,
  questions,
  questionVersions,
} from "@/db/schema";
import { type AttemptPoolItem, buildAttempt } from "@/engine/attempt";
import { computeDeadline } from "@/engine/attempts/deadline";
import { examSettingsSchema } from "@/engine/exam";
import { effectiveState } from "@/engine/exam-state";
import { BlueprintError } from "@/engine/selection/select";
import { blueprintSchema } from "@/engine/selection/types";
import type { CurrentUser } from "@/server/auth";
import { scopeFor } from "@/server/access";
import { getExam, loadPool } from "@/server/authoring/data";
import type { ActionResult } from "@/server/authoring/questions";
import { hashCode } from "./codes";

type Exam = typeof exams.$inferSelect;

/** The pool an exam was published with: exactly the locked question versions. */
export async function lockedPool(exam: Exam): Promise<AttemptPoolItem[]> {
  const ids = Object.values((exam.lockedVersions ?? {}) as Record<string, string>);
  if (ids.length === 0) return [];
  return db
    .select({
      id: questionVersions.questionId,
      versionId: questionVersions.id,
      topicId: questions.topicId,
      type: questionVersions.type,
      def: questionVersions.def,
      weight: questionVersions.weight,
      difficulty: questionVersions.difficulty,
      points: questionVersions.points,
      groupKey: questionVersions.groupKey,
      conflictsWith: questionVersions.conflictsWith,
    })
    .from(questionVersions)
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .where(inArray(questionVersions.id, ids));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Thrown inside the transaction to roll back with a message for the student. */
class StartError extends Error {}

const CANT_BUILD = "This exam can't be built right now. Please tell your instructor.";

/** Postgres unique violation on the one-live-attempt index: a double-click start. */
function isLiveConflict(e: unknown) {
  const err = e as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const c = err.cause ?? err;
  return c.code === "23505" && c.constraint_name === "attempts_one_live_uq";
}

async function create(
  tx: Tx,
  user: CurrentUser,
  exam: Exam,
  pool: AttemptPoolItem[],
  isPreview: boolean,
): Promise<string> {
  const blueprint = blueprintSchema.parse(exam.blueprint);
  const settings = examSettingsSchema.parse(exam.settings);
  const seed = randomUUID();

  let built;
  try {
    built = buildAttempt(seed, blueprint, pool);
  } catch (e) {
    if (e instanceof BlueprintError) throw new StartError(CANT_BUILD);
    throw e;
  }

  const exts = await tx
    .select({ kind: extensions.kind, value: extensions.value })
    .from(extensions)
    .where(and(eq(extensions.userId, user.id), or(isNull(extensions.examId), eq(extensions.examId, exam.id))));
  const startedAt = new Date();
  const deadlineAt = computeDeadline(startedAt, settings.timeLimitMinutes, exts);

  const [a] = await tx
    .insert(attempts)
    .values({ orgId: user.orgId, examId: exam.id, userId: user.id, seed, isPreview, startedAt, deadlineAt })
    .returning({ id: attempts.id });
  await tx.insert(attemptItems).values(
    built.items.map((i) => ({
      attemptId: a.id,
      questionVersionId: i.versionId,
      position: i.position,
      instance: i.instance,
    })),
  );
  return a.id;
}

async function liveAttempt(examId: string, userId: string) {
  const [existing] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.examId, examId),
        eq(attempts.userId, userId),
        eq(attempts.isPreview, false),
        eq(attempts.state, "in_progress"),
      ),
    )
    .limit(1);
  return existing?.id ?? null;
}

export async function startAttempt(
  user: CurrentUser,
  examId: string,
  code?: string,
): Promise<ActionResult<{ attemptId: string }>> {
  const [exam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.id, examId), eq(exams.orgId, user.orgId)))
    .limit(1);
  if (!exam) return { ok: false, error: "That exam doesn't exist." };

  const [enrolled] = await db
    .select({ userId: enrollments.userId })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, exam.courseId), eq(enrollments.userId, user.id), eq(enrollments.role, "student")))
    .limit(1);
  if (!enrolled) return { ok: false, error: "You aren't enrolled in this course." };

  // Resume beats everything else: leaving and coming back is not a new attempt.
  const existing = await liveAttempt(exam.id, user.id);
  if (existing) return { ok: true, attemptId: existing };

  if (effectiveState(exam, new Date()) !== "open") return { ok: false, error: "This exam isn't open." };

  const settings = examSettingsSchema.parse(exam.settings);
  if (settings.requireCode && !code?.trim()) return { ok: false, error: "Enter your access code." };
  const pool = await lockedPool(exam);

  try {
    const attemptId = await db.transaction(async (tx) => {
      // Counted inside the transaction; the one-live-attempt index catches a
      // concurrent start that slips past this check.
      const [{ used }] = await tx
        .select({ used: count() })
        .from(attempts)
        .where(and(eq(attempts.examId, exam.id), eq(attempts.userId, user.id), eq(attempts.isPreview, false)));
      if (used >= settings.attemptsAllowed) throw new StartError("You've used all your attempts for this exam.");

      if (settings.requireCode) {
        // Redeem and create together: a failed build must not burn the student's code.
        const redeemed = await tx
          .update(examCodes)
          .set({ usedAt: new Date(), assignedUserId: user.id })
          .where(
            and(
              eq(examCodes.examId, exam.id),
              eq(examCodes.codeHash, hashCode(code!)),
              isNull(examCodes.usedAt),
              or(isNull(examCodes.assignedUserId), eq(examCodes.assignedUserId, user.id)),
            ),
          )
          .returning({ id: examCodes.id });
        if (redeemed.length === 0) throw new StartError("That code isn't valid, or has already been used.");
      }
      return create(tx, user, exam, pool, false);
    });
    return { ok: true, attemptId };
  } catch (e) {
    if (e instanceof StartError) return { ok: false, error: e.message };
    if (isLiveConflict(e)) {
      const live = await liveAttempt(exam.id, user.id);
      if (live) return { ok: true, attemptId: live };
    }
    throw e;
  }
}

/** Staff "take it as a student": no enrollment, code or state checks; excluded from results. */
export async function startPreviewAttempt(
  user: CurrentUser,
  examId: string,
): Promise<ActionResult<{ attemptId: string }>> {
  const exam = await getExam(await scopeFor(user), examId);
  if (!exam) return { ok: false, error: "That exam doesn't exist." };

  // A published exam previews its locked questions; a draft previews what's active now.
  const pool = exam.lockedVersions ? await lockedPool(exam) : await loadPool(exam.orgId, exam.courseId);
  try {
    const attemptId = await db.transaction((tx) => create(tx, user, exam, pool, true));
    return { ok: true, attemptId };
  } catch (e) {
    if (e instanceof StartError) return { ok: false, error: e.message };
    throw e;
  }
}
