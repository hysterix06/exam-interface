import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attemptItems, grades, questions, questionVersions, responses, topics } from "@/db/schema";
import { shapeItemResult, instanceFeedback, type ShownItemResult } from "@/engine/attempts/results";
import { visibility } from "@/engine/attempts/release";
import { examSettingsSchema } from "@/engine/exam";
import { topicMastery } from "@/engine/mastery";
import { masteryByObjective } from "@/engine/tags";
import type { GradeLine } from "@/engine/types";
import { getQuestionType } from "@/question-types/registry";
import type { CurrentUser } from "@/server/auth";
import { getOwnAttempt } from "./take";

const FULL = { score: true, answers: true, feedback: true, explanations: true };

export async function loadResults(user: CurrentUser, attemptId: string) {
  const own = await getOwnAttempt(user, attemptId);
  if (!own || own.attempt.state === "in_progress") return null;
  const { attempt, exam } = own;

  // Staff previews see everything; students see what the release setting allows.
  const v = attempt.isPreview
    ? FULL
    : visibility(exam.state, examSettingsSchema.parse(exam.settings).release);
  const base = { examId: exam.id, title: exam.title, isPreview: attempt.isPreview, state: attempt.state };
  if (!v.score) return { ...base, hidden: true as const };

  const rows = await db
    .select({
      id: attemptItems.id,
      position: attemptItems.position,
      instance: attemptItems.instance,
      type: questionVersions.type,
      response: responses.response,
      score: grades.score,
      max: grades.max,
      lines: grades.lines,
      needsReview: grades.needsReview,
      topicId: topics.id,
      topicName: topics.name,
      tags: questionVersions.tags,
    })
    .from(attemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .leftJoin(topics, eq(topics.id, questions.topicId))
    .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
    .leftJoin(grades, eq(grades.attemptItemId, attemptItems.id))
    .where(eq(attemptItems.attemptId, attempt.id))
    .orderBy(asc(attemptItems.position));

  return {
    ...base,
    hidden: false as const,
    score: attempt.score ?? 0,
    max: attempt.maxScore ?? 0,
    pendingReview: attempt.state === "submitted",
    latePenalty: (attempt.latePenalty as { explanation: string; points: number } | null) ?? null,
    mastery: topicMastery(rows.map((r) => ({ topicId: r.topicId, topicName: r.topicName, score: r.score ?? 0, max: r.max ?? 0, needsReview: r.needsReview ?? false }))),
    objectives: masteryByObjective(rows.map((r) => ({ tags: r.tags ?? [], score: r.score ?? 0, max: r.max ?? 0, needsReview: r.needsReview ?? false }))),
    items: rows.map((r) => {
      const shown: ShownItemResult = shapeItemResult(v, {
        score: r.score ?? 0,
        max: r.max ?? 0,
        lines: (r.lines ?? []) as GradeLine[],
        feedback: instanceFeedback(r.instance),
      });
      return {
        id: r.id,
        position: r.position,
        type: r.type,
        instance: getQuestionType(r.type).redact(r.instance),
        response: v.answers ? (r.response ?? null) : null,
        ...shown,
      };
    }),
  };
}
