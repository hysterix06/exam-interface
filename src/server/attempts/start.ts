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
import { loadPool } from "@/server/authoring/data";
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

async function create(
  user: CurrentUser,
  exam: Exam,
  pool: AttemptPoolItem[],
  isPreview: boolean,
): Promise<ActionResult<{ attemptId: string }>> {
  const blueprint = blueprintSchema.parse(exam.blueprint);
  const settings = examSettingsSchema.parse(exam.settings);
  const seed = randomUUID();

  let built;
  try {
    built = buildAttempt(seed, blueprint, pool);
  } catch (e) {
    if (e instanceof BlueprintError) {
      return { ok: false, error: "This exam can't be built right now. Please tell your instructor." };
    }
    throw e;
  }

  const exts = await db
    .select({ kind: extensions.kind, value: extensions.value })
    .from(extensions)
    .where(and(eq(extensions.userId, user.id), or(isNull(extensions.examId), eq(extensions.examId, exam.id))));
  const startedAt = new Date();
  const deadlineAt = computeDeadline(startedAt, settings.timeLimitMinutes, exts);

  const attemptId = await db.transaction(async (tx) => {
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
  });
  return { ok: true, attemptId };
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
    .where(and(eq(enrollments.courseId, exam.courseId), eq(enrollments.userId, user.id)))
    .limit(1);
  if (!enrolled) return { ok: false, error: "You aren't enrolled in this course." };

  // Resume beats everything else: leaving and coming back is not a new attempt.
  const [existing] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.examId, exam.id),
        eq(attempts.userId, user.id),
        eq(attempts.isPreview, false),
        eq(attempts.state, "in_progress"),
      ),
    )
    .limit(1);
  if (existing) return { ok: true, attemptId: existing.id };

  if (effectiveState(exam, new Date()) !== "open") return { ok: false, error: "This exam isn't open." };

  const settings = examSettingsSchema.parse(exam.settings);
  const [{ used }] = await db
    .select({ used: count() })
    .from(attempts)
    .where(and(eq(attempts.examId, exam.id), eq(attempts.userId, user.id), eq(attempts.isPreview, false)));
  if (used >= settings.attemptsAllowed) {
    return { ok: false, error: "You've used all your attempts for this exam." };
  }

  const pool = await lockedPool(exam);

  if (!settings.requireCode) return create(user, exam, pool, false);

  if (!code?.trim()) return { ok: false, error: "Enter your access code." };
  // Redeem and create together: a failed build must not burn the student's code.
  return db.transaction(async (tx) => {
    const redeemed = await tx
      .update(examCodes)
      .set({ usedAt: new Date(), assignedUserId: user.id })
      .where(
        and(
          eq(examCodes.examId, exam.id),
          eq(examCodes.codeHash, hashCode(code)),
          isNull(examCodes.usedAt),
          or(isNull(examCodes.assignedUserId), eq(examCodes.assignedUserId, user.id)),
        ),
      )
      .returning({ id: examCodes.id });
    if (redeemed.length === 0) {
      return { ok: false as const, error: "That code isn't valid, or has already been used." };
    }
    const made = await create(user, exam, pool, false);
    if (!made.ok) tx.rollback();
    return made;
  });
}

/** Staff "take it as a student": no enrollment, code or state checks; excluded from results. */
export async function startPreviewAttempt(
  user: CurrentUser,
  examId: string,
): Promise<ActionResult<{ attemptId: string }>> {
  const [exam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.id, examId), eq(exams.orgId, user.orgId)))
    .limit(1);
  if (!exam) return { ok: false, error: "That exam doesn't exist." };

  const blueprint = blueprintSchema.parse(exam.blueprint);
  const topics = new Set(blueprint.sections.map((s) => s.topicId));
  // A published exam previews its locked questions; a draft previews what's active now.
  const pool = exam.lockedVersions
    ? await lockedPool(exam)
    : (await loadPool(user.orgId)).filter((q) => topics.has(q.topicId));
  return create(user, exam, pool, true);
}
