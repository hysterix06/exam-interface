import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { attemptItems, attempts, profiles, questionVersions, responses } from "@/db/schema";
import { responseTokens, tokenUniverse } from "@/engine/analysis";
import { findSimilarAttempts, type SimilarityAttempt } from "@/engine/similarity";
import { questionLabel } from "@/lib/question-label";
import type { Scope } from "@/server/access";
import { getExam } from "@/server/authoring/data";
import { sweepExpired } from "@/server/attempts/take";

/** Similarity signals for one exam's finished, real attempts. Shown to staff only; nothing is enforced. */
export async function loadSignals(scope: Scope, examId: string) {
  const exam = await getExam(scope, examId);
  if (!exam) return null;
  await sweepExpired(exam);
  const rows = await db
    .select({
      attemptId: attempts.id,
      name: profiles.fullName,
      email: profiles.email,
      questionId: questionVersions.questionId,
      type: questionVersions.type,
      def: questionVersions.def,
      instance: attemptItems.instance,
      response: responses.response,
    })
    .from(attemptItems)
    .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
    .innerJoin(profiles, eq(profiles.id, attempts.userId))
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
    .where(and(eq(attempts.examId, examId), eq(attempts.isPreview, false), inArray(attempts.state, ["submitted", "graded"])));

  const byAttempt = new Map<string, SimilarityAttempt & { items: SimilarityAttempt["items"][number][] }>();
  const names = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const r of rows) {
    names.set(r.attemptId, r.name ?? r.email);
    labels.set(r.questionId, questionLabel(r.def, 70));
    const a = byAttempt.get(r.attemptId) ?? { attemptId: r.attemptId, items: [] };
    const text = r.type === "long-answer" ? (r.response as { text?: unknown } | null)?.text : undefined;
    a.items.push({
      questionId: r.questionId,
      tokens: responseTokens(r.type, r.instance, r.response),
      keyTokens: tokenUniverse(r.type, r.instance)?.key ?? [],
      text: typeof text === "string" ? text : undefined,
    });
    byAttempt.set(r.attemptId, a);
  }
  const pairs = findSimilarAttempts([...byAttempt.values()]).slice(0, 50);
  return {
    students: byAttempt.size,
    pairs: pairs.map((p) => ({
      ...p,
      nameA: names.get(p.a) ?? p.a,
      nameB: names.get(p.b) ?? p.b,
      evidence: p.evidence.map((e) => ({ ...e, question: labels.get(e.questionId) ?? e.questionId })),
    })),
  };
}
