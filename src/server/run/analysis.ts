import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attemptItems, attempts, grades, questionVersions, responses } from "@/db/schema";
import { analyseItems, chosenOptions, withDeadDistractors, type AnalysisAttempt, type ItemStats } from "@/engine/analysis";
import { questionLabel } from "@/lib/question-label";
import type { Scope } from "@/server/access";
import { getExam } from "@/server/authoring/data";
import { sweepExpired } from "@/server/attempts/take";

export interface AnalysedQuestion extends ItemStats {
  label: string;
  type: string;
  /** Option id -> text, for choice questions. */
  optionText: Record<string, string>;
  keyIds: string[];
}

/** Item analysis over finished, real attempts (previews and unfinished work are excluded). */
export async function loadAnalysis(scope: Scope, examId: string): Promise<{ students: number; questions: AnalysedQuestion[] } | null> {
  const exam = await getExam(scope, examId);
  if (!exam) return null;
  await sweepExpired(exam);

  const rows = await db
    .select({
      attemptId: attempts.id,
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
  const meta = new Map<string, Pick<AnalysedQuestion, "label" | "type" | "optionText" | "keyIds">>();
  for (const r of rows) {
    if (r.needsReview) continue;
    const a = byAttempt.get(r.attemptId) ?? { attemptId: r.attemptId, items: [] };
    a.items.push({ questionId: r.questionId, score: r.score, max: r.max, chosen: chosenOptions(r.type, r.response) });
    byAttempt.set(r.attemptId, a);

    if (!meta.has(r.questionId)) {
      const inst = r.instance as { options?: { id: string; text: string }[]; key?: string[]; answer?: string | boolean };
      const optionText = Object.fromEntries((inst.options ?? (r.type === "true-false" ? [{ id: "true", text: "True" }, { id: "false", text: "False" }] : [])).map((o) => [o.id, o.text]));
      const keyIds = inst.key ?? (typeof inst.answer === "string" ? [inst.answer] : typeof inst.answer === "boolean" ? [String(inst.answer)] : []);
      meta.set(r.questionId, { label: questionLabel(r.def, 90), type: r.type, optionText, keyIds });
    }
  }

  const stats = analyseItems([...byAttempt.values()]).map((s): AnalysedQuestion => {
    const m = meta.get(s.questionId)!;
    const withDead = Object.keys(m.optionText).length > 0 ? withDeadDistractors(s, Object.keys(m.optionText), m.keyIds) : s;
    return { ...withDead, ...m };
  });
  return { students: byAttempt.size, questions: stats.sort((a, b) => (a.discrimination ?? 2) - (b.discrimination ?? 2)) };
}
