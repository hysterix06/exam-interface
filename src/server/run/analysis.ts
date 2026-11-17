import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { attemptItems, attempts, events, grades, questionVersions, responses } from "@/db/schema";
import { dwellTimes, median } from "@/engine/dwell";
import { analyseItems, responseTokens, tokenUniverse, withDeadDistractors, type AnalysisAttempt, type ItemStats } from "@/engine/analysis";
import { questionLabel } from "@/lib/question-label";
import type { Scope } from "@/server/access";
import { getExam } from "@/server/authoring/data";
import { sweepExpired } from "@/server/attempts/take";

export interface AnalysedQuestion extends ItemStats {
  label: string;
  type: string;
  /** Token -> readable text ("Blank 2: kettle", "Oak → Plants"), for types with choices. */
  optionText: Record<string, string>;
  keyIds: string[];
  /** Whether unpicked wrong tokens count as dead distractors (real options, not every possible pair). */
  options: boolean;
  /** Median seconds students spent on it (from view events; null when none were logged). */
  medianSeconds: number | null;
}

/** Item analysis over finished, real attempts (previews and unfinished work are excluded). */
export async function loadAnalysis(scope: Scope, examId: string): Promise<{ students: number; questions: AnalysedQuestion[] } | null> {
  const exam = await getExam(scope, examId);
  if (!exam) return null;
  await sweepExpired(exam);

  const rows = await db
    .select({
      attemptId: attempts.id,
      itemId: attemptItems.id,
      startedAt: attempts.startedAt,
      submittedAt: attempts.submittedAt,
      questionId: questionVersions.questionId,
      type: questionVersions.type,
      def: questionVersions.def,
      instance: attemptItems.instance,
      response: responses.response,
      score: grades.score,
      max: grades.max,
      needsReview: grades.needsReview,
    })
    .from(attemptItems)
    .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .innerJoin(grades, eq(grades.attemptItemId, attemptItems.id))
    .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
    .where(and(eq(attempts.examId, examId), eq(attempts.isPreview, false), eq(attempts.state, "graded")));

  const byAttempt = new Map<string, AnalysisAttempt>();
  const meta = new Map<string, Pick<AnalysedQuestion, "label" | "type" | "optionText" | "keyIds" | "options">>();
  for (const r of rows) {
    if (r.needsReview) continue;
    const a = byAttempt.get(r.attemptId) ?? { attemptId: r.attemptId, items: [] };
    a.items.push({ questionId: r.questionId, score: r.score, max: r.max, chosen: responseTokens(r.type, r.instance, r.response) });
    byAttempt.set(r.attemptId, a);

    if (!meta.has(r.questionId)) {
      // Token ids are stable across students; the text comes from the first instance seen.
      const u = tokenUniverse(r.type, r.instance);
      meta.set(r.questionId, {
        label: questionLabel(r.def, 90),
        type: r.type,
        optionText: Object.fromEntries((u?.tokens ?? []).map((t) => [t.id, t.text])),
        keyIds: u?.key ?? [],
        options: u?.options ?? false,
      });
    }
  }

  // Time per question: rebuild each attempt's dwell from its event log.
  const log = await db
    .select({ attemptId: events.attemptId, type: events.type, ts: events.ts, payload: events.payload })
    .from(events)
    .innerJoin(attempts, eq(attempts.id, events.attemptId))
    .where(and(eq(attempts.examId, examId), eq(attempts.isPreview, false), eq(attempts.state, "graded"), inArray(events.type, ["view", "blur", "focus", "idle", "active"])));
  const questionOfItem = new Map(rows.map((r) => [r.itemId, r.questionId]));
  const secondsByQuestion = new Map<string, number[]>();
  for (const [attemptId, evs] of Map.groupBy(log, (e) => e.attemptId)) {
    if (!evs.some((e) => e.type === "view")) continue;
    const a = rows.find((r) => r.attemptId === attemptId)!;
    const { seconds } = dwellTimes(evs, a.startedAt, a.submittedAt ?? new Date());
    for (const [itemId, s] of Object.entries(seconds)) {
      const q = questionOfItem.get(itemId);
      if (q) secondsByQuestion.set(q, [...(secondsByQuestion.get(q) ?? []), s]);
    }
  }

  const stats = analyseItems([...byAttempt.values()]).map((s): AnalysedQuestion => {
    const m = meta.get(s.questionId)!;
    const withDead = m.options ? withDeadDistractors(s, Object.keys(m.optionText), m.keyIds) : s;
    return { ...withDead, ...m, medianSeconds: median(secondsByQuestion.get(s.questionId) ?? []) };
  });
  return { students: byAttempt.size, questions: stats.sort((a, b) => (a.discrimination ?? 2) - (b.discrimination ?? 2)) };
}
