import "server-only";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { attemptItems, attempts, courses, exams, grades, profiles, questionVersions, responses } from "@/db/schema";
import { gradeRubric, type LongAnswerInstance } from "@/question-types/long-answer/core";
import { getQuestionType } from "@/question-types/registry";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";
import type { ActionResult } from "@/server/authoring/questions";
import { questionLabel } from "@/lib/question-label";
import { canTeach, inScope, type Scope, scopeFor } from "@/server/access";
import { recomputeAttempt } from "@/server/run/totals";
import { overrideLines } from "@/engine/override";
import type { GradeLine } from "@/engine/types";

/** Exams with answers waiting for a human, real attempts only. */
export async function listReviewExams(scope: Scope) {
  return db
    .select({
      id: exams.id,
      title: exams.title,
      state: exams.state,
      courseTitle: courses.title,
      pending: count(),
    })
    .from(grades)
    .innerJoin(attemptItems, eq(attemptItems.id, grades.attemptItemId))
    .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
    .innerJoin(exams, eq(exams.id, attempts.examId))
    .innerJoin(courses, eq(courses.id, exams.courseId))
    .where(and(eq(exams.orgId, scope.orgId), inScope(exams.courseId, scope), eq(grades.needsReview, true), eq(attempts.isPreview, false)))
    .groupBy(exams.id, exams.title, exams.state, courses.title)
    .orderBy(asc(exams.title));
}

export interface ReviewItem {
  attemptItemId: string;
  /** Stable per exam: "Student 3". Real names only when the grader asks. */
  label: string;
  text: string;
  instance: LongAnswerInstance;
  points: number;
}

/**
 * The marking queue for one exam, one question at a time ("grade one question
 * across all students"). Students are anonymous unless `reveal` is set.
 */
export async function loadReviewQueue(scope: Scope, examId: string, questionId: string | undefined, reveal: boolean) {
  const pending = await db
    .select({
      attemptItemId: attemptItems.id,
      attemptId: attempts.id,
      userId: attempts.userId,
      startedAt: attempts.startedAt,
      questionId: questionVersions.questionId,
      def: questionVersions.def,
      instance: attemptItems.instance,
      response: responses.response,
      max: grades.max,
    })
    .from(grades)
    .innerJoin(attemptItems, eq(attemptItems.id, grades.attemptItemId))
    .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
    .innerJoin(exams, eq(exams.id, attempts.examId))
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
    .where(and(eq(exams.id, examId), eq(exams.orgId, scope.orgId), inScope(exams.courseId, scope), eq(grades.needsReview, true), eq(attempts.isPreview, false)))
    .orderBy(asc(attempts.startedAt), asc(attemptItems.position));

  const byQuestion = new Map<string, { questionId: string; label: string; count: number }>();
  for (const p of pending) {
    const q = byQuestion.get(p.questionId) ?? { questionId: p.questionId, label: questionLabel(p.def, 70), count: 0 };
    q.count++;
    byQuestion.set(p.questionId, q);
  }
  const questionsList = [...byQuestion.values()].sort((a, b) => b.count - a.count);
  const current = questionId && byQuestion.has(questionId) ? questionId : questionsList[0]?.questionId;

  // "Student N" is the rank of the attempt in this exam, so it never changes between visits.
  const order = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.examId, examId), eq(attempts.isPreview, false)))
    .orderBy(asc(attempts.startedAt), asc(attempts.id));
  const rank = new Map(order.map((a, i) => [a.id, i + 1]));

  let names = new Map<string, string>();
  const shownUsers = [...new Set(pending.filter((p) => p.questionId === current).map((p) => p.userId))];
  if (reveal && shownUsers.length > 0) {
    const people = await db
      .select({ id: profiles.id, name: profiles.fullName, email: profiles.email })
      .from(profiles)
      .where(inArray(profiles.id, shownUsers));
    names = new Map(people.map((p) => [p.id, p.name ?? p.email]));
  }

  const items: ReviewItem[] = pending
    .filter((p) => p.questionId === current)
    .map((p) => ({
      attemptItemId: p.attemptItemId,
      label: reveal ? (names.get(p.userId) ?? "Unknown") : `Student ${rank.get(p.attemptId)}`,
      text: (p.response as { text?: string } | null)?.text ?? "",
      instance: p.instance as LongAnswerInstance,
      points: p.max,
    }));

  return { questions: questionsList, current, items };
}

/** Record a grader's rubric ticks and, if it was the attempt's last open item, finish the attempt. */
export async function saveReview(
  user: CurrentUser,
  input: { attemptItemId: string; ticked: string[] },
): Promise<ActionResult> {
  const scope = await scopeFor(user);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        gradeId: grades.id,
        needsReview: grades.needsReview,
        max: grades.max,
        before: grades.score,
        instance: attemptItems.instance,
        attemptId: attemptItems.attemptId,
        type: questionVersions.type,
        orgId: attempts.orgId,
        courseId: exams.courseId,
      })
      .from(grades)
      .innerJoin(attemptItems, eq(attemptItems.id, grades.attemptItemId))
      .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
      .innerJoin(exams, eq(exams.id, attempts.examId))
      .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
      .where(eq(grades.attemptItemId, input.attemptItemId))
      .for("update")
      .limit(1);
    if (!row || row.orgId !== user.orgId || !canTeach(scope, row.courseId)) return { ok: false as const, error: "That answer no longer exists." };
    if (!row.needsReview) return { ok: false as const, error: "That answer has already been marked." };
    if (!getQuestionType(row.type).manual) return { ok: false as const, error: "That question is marked automatically." };

    const inst = row.instance as LongAnswerInstance;
    const valid = new Set(inst.rubric.map((c) => c.id));
    const result = gradeRubric(inst, input.ticked.filter((id) => valid.has(id)), row.max);

    await tx
      .update(grades)
      .set({ score: result.score, lines: result.lines, gradedBy: "user", graderId: user.id, needsReview: false })
      .where(eq(grades.id, row.gradeId));

    await recomputeAttempt(tx, row.attemptId);

    await writeAudit(
      { orgId: user.orgId, actorId: user.id, action: "grade.review", entityType: "attempt_item", entityId: input.attemptItemId, before: { score: row.before }, after: { score: result.score, ticked: input.ticked } },
      tx,
    );
    return { ok: true as const };
  });
}


/**
 * A person sets one answer's score directly, with a reason. Works for any
 * question type and for answers already marked. The grader's lines are kept and
 * one adjustment line is added, so the explanation still adds up to the score.
 */
export async function overrideGrade(
  user: CurrentUser,
  input: { attemptItemId: string; score: number; reason: string },
): Promise<ActionResult> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Give a reason. It goes in the audit log and on the student's breakdown." };
  if (!Number.isFinite(input.score)) return { ok: false, error: "Enter a number." };
  const scope = await scopeFor(user);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        gradeId: grades.id,
        score: grades.score,
        max: grades.max,
        lines: grades.lines,
        needsReview: grades.needsReview,
        overrideReason: grades.overrideReason,
        attemptId: attemptItems.attemptId,
        attemptState: attempts.state,
        orgId: attempts.orgId,
        courseId: exams.courseId,
      })
      .from(grades)
      .innerJoin(attemptItems, eq(attemptItems.id, grades.attemptItemId))
      .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
      .innerJoin(exams, eq(exams.id, attempts.examId))
      .where(eq(grades.attemptItemId, input.attemptItemId))
      .for("update")
      .limit(1);
    if (!row || row.orgId !== user.orgId || !canTeach(scope, row.courseId)) return { ok: false as const, error: "That answer no longer exists." };
    if (row.attemptState === "in_progress") return { ok: false as const, error: "The student is still working on this exam." };
    if (input.score < 0 || input.score > row.max) return { ok: false as const, error: `The score must be between 0 and ${row.max}.` };

    const score = Math.round(input.score * 10_000) / 10_000;
    const lines = overrideLines((row.lines ?? []) as GradeLine[], { score, max: row.max, by: user.fullName ?? user.email, reason });
    await tx
      .update(grades)
      .set({ score, lines, gradedBy: "user", graderId: user.id, needsReview: false, overrideReason: reason })
      .where(eq(grades.id, row.gradeId));
    await recomputeAttempt(tx, row.attemptId);
    await writeAudit(
      {
        orgId: user.orgId,
        actorId: user.id,
        action: "grade.override",
        entityType: "attempt_item",
        entityId: input.attemptItemId,
        before: { score: row.score, needsReview: row.needsReview, overrideReason: row.overrideReason },
        after: { score, attemptId: row.attemptId },
        reason,
      },
      tx,
    );
    return { ok: true as const };
  });
}
