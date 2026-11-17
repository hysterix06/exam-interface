import "server-only";
import { and, asc, avg, count, eq, sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { attemptItems, attempts, grades, questionVersions, responses } from "@/db/schema";
import { type AdaptivePlan, nextAdaptive, type PlanItem, type StepResult, type StepTrace } from "@/engine/adaptive-live";
import type { AttemptPoolItem } from "@/engine/attempt";
import type { ExamSettings } from "@/engine/exam";
import { generateQuestion } from "@/engine/generate";
import { difficultyFromLevel, difficultyFromShare } from "@/engine/irt";
import { createRng, questionSeed } from "@/engine/rng";
import { blueprintTopics, type Blueprint } from "@/engine/selection/types";
import { getQuestionType } from "@/question-types/registry";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;

/** Past results needed before an item's measured difficulty replaces its level. */
const MIN_CALIBRATION = 30;

/**
 * Freeze what decides an adaptive attempt: the drawable pool (hand-marked
 * types left out: their result isn't known until someone marks them) and
 * each question's difficulty on the Rasch scale.
 */
export async function buildPlan(reader: Reader, examId: string, blueprint: Blueprint, settings: NonNullable<ExamSettings["adaptive"]>, pool: readonly AttemptPoolItem[]): Promise<AdaptivePlan> {
  const topics = new Set(blueprintTopics(blueprint));
  const eligible = pool.filter((q) => topics.has(q.topicId) && q.weight > 0 && !getQuestionType(q.type).manual && !getQuestionType(q.type).review);
  const history = await reader
    .select({ questionId: questionVersions.questionId, share: avg(sql<number>`case when ${grades.max} > 0 then ${grades.score} / ${grades.max} end`), n: count() })
    .from(grades)
    .innerJoin(attemptItems, eq(attemptItems.id, grades.attemptItemId))
    .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .where(and(eq(attempts.examId, examId), eq(attempts.isPreview, false), eq(attempts.state, "graded")))
    .groupBy(questionVersions.questionId);
  const measured = new Map(history.filter((h) => h.n >= MIN_CALIBRATION && h.share !== null).map((h) => [h.questionId, Number(h.share)]));
  const items: PlanItem[] = eligible.map((q) => ({
    id: q.id,
    versionId: q.versionId,
    type: q.type,
    points: q.points,
    difficulty: q.difficulty,
    weight: q.weight,
    groupKey: q.groupKey ?? null,
    b: measured.has(q.id) ? difficultyFromShare(measured.get(q.id)!) : difficultyFromLevel(q.difficulty),
  }));
  const fromData = items.filter((i) => measured.has(i.id)).length;
  return {
    rule: settings.rule,
    length: Math.min(settings.length, items.length),
    threshold: settings.threshold,
    items,
    calibration: fromData ? `${fromData} of ${items.length} difficulties come from at least ${MIN_CALIBRATION} past results; the rest from their level.` : "Difficulties come from each question's level (easy −1, medium 0, hard +1).",
  };
}

export interface StoredSelection extends StepTrace {
  /** The previous result exactly as used for this choice (replay reads this). */
  previous: StepTrace["previous"];
}

/** The results so far, as each later step recorded them, plus the current item's result now. */
async function historyOf(tx: Tx, attemptId: string, plan: AdaptivePlan): Promise<{ history: StepResult[]; position: number }> {
  const rows = await tx
    .select({ position: attemptItems.position, selection: attemptItems.selection, instance: attemptItems.instance, versionId: attemptItems.questionVersionId, response: responses.response, questionId: questionVersions.questionId, type: questionVersions.type, points: questionVersions.points })
    .from(attemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
    .where(eq(attemptItems.attemptId, attemptId))
    .orderBy(asc(attemptItems.position));
  const history: StepResult[] = [];
  rows.forEach((r, i) => {
    const next = rows[i + 1]?.selection as StoredSelection | undefined;
    if (next?.previous) history.push({ questionId: next.previous.questionId, score: next.previous.score, max: next.previous.max });
    else {
      // The latest item: grade it now, purely, from its frozen instance.
      const type = getQuestionType(r.type);
      const parsed = r.response === null ? null : type.responseSchema.safeParse(r.response);
      const g = type.grade(r.instance, parsed?.success ? parsed.data : null, { points: plan.items.find((p) => p.id === r.questionId)?.points ?? r.points });
      history.push({ questionId: r.questionId, score: g.score, max: g.max });
    }
  });
  return { history, position: rows.length };
}

/**
 * Add the next adaptive question to an attempt (inside the caller's
 * transaction). Returns false when the attempt is complete or the pool ran out.
 */
export async function appendAdaptiveStep(tx: Tx, attempt: { id: string; seed: string; plan: unknown }, opened: Date | null): Promise<boolean> {
  const plan = attempt.plan as AdaptivePlan;
  const { history, position } = await historyOf(tx, attempt.id, plan);
  if (position >= plan.length) return false;
  const next = nextAdaptive(attempt.seed, plan, history);
  if (!next) return false;
  await insertStep(tx, attempt, next.item, next.trace, position, opened);
  return true;
}

/** Generate and store one step (also used for the first question when the attempt starts). */
export async function insertStep(tx: Tx, attempt: { id: string; seed: string }, item: PlanItem, trace: StepTrace, position: number, opened: Date | null) {
  const [v] = await tx.select({ def: questionVersions.def }).from(questionVersions).where(eq(questionVersions.id, item.versionId)).limit(1);
  const { instance } = generateQuestion(item.type, v.def, createRng(questionSeed(attempt.seed, item.versionId)));
  await tx.insert(attemptItems).values({ attemptId: attempt.id, questionVersionId: item.versionId, seedVersionId: item.versionId, position, instance, openedAt: opened, selection: trace });
}
