import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { attemptItems, attempts, exams, grades, questions, questionVersions, responses } from "@/db/schema";
import { type RegradeDiff, regradeItems } from "@/engine/regrade";
import { questionLabel } from "@/lib/question-label";
import { getQuestionType } from "@/question-types/registry";
import { type Scope, scopeFor } from "@/server/access";
import type { CurrentUser } from "@/server/auth";
import { getExam } from "@/server/authoring/data";
import { writeAudit } from "@/server/authoring/audit";
import type { ActionResult } from "@/server/authoring/questions";

/** Machine-graded questions that real students answered in this exam, with their versions. */
export async function listRegradable(scope: Scope, examId: string) {
  if (!(await getExam(scope, examId))) return [];
  const used = await db
    .selectDistinct({ questionId: questionVersions.questionId, type: questionVersions.type })
    .from(attemptItems)
    .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
    .innerJoin(exams, eq(exams.id, attempts.examId))
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .where(and(eq(exams.id, examId), eq(attempts.isPreview, false)));
  const auto = used.filter((u) => !getQuestionType(u.type).manual);
  if (auto.length === 0) return [];

  const versions = await db
    .select({ id: questionVersions.id, questionId: questionVersions.questionId, version: questionVersions.version, def: questionVersions.def })
    .from(questionVersions)
    .where(inArray(questionVersions.questionId, auto.map((u) => u.questionId)))
    .orderBy(desc(questionVersions.version));
  const current = await db
    .select({ id: questions.id, version: questions.version })
    .from(questions)
    .where(inArray(questions.id, auto.map((u) => u.questionId)));

  return auto.map((u) => {
    const vs = versions.filter((v) => v.questionId === u.questionId);
    return {
      questionId: u.questionId,
      label: questionLabel(vs[0]?.def, 80),
      currentVersion: current.find((c) => c.id === u.questionId)?.version ?? 0,
      versions: vs.map((v) => ({ version: v.version, label: questionLabel(v.def, 70) })),
    };
  });
}

type Reader = Pick<typeof db, "select">;

async function gather(reader: Reader, scope: Scope, examId: string, questionId: string, targetVersion: number) {
  if (!(await getExam(scope, examId))) return null;
  const [target] = await reader
    .select()
    .from(questionVersions)
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .where(and(eq(questionVersions.questionId, questionId), eq(questionVersions.version, targetVersion), eq(questions.orgId, scope.orgId)))
    .limit(1);
  if (!target) return null;
  if (getQuestionType(target.question_versions.type).manual) return { manual: true as const };

  const rows = await reader
    .select({
      itemId: attemptItems.id,
      attemptId: attempts.id,
      attemptSeed: attempts.seed,
      oldVersionId: attemptItems.questionVersionId,
      response: responses.response,
      max: grades.max,
      oldScore: grades.score,
    })
    .from(attemptItems)
    .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
    .innerJoin(exams, eq(exams.id, attempts.examId))
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
    .leftJoin(grades, eq(grades.attemptItemId, attemptItems.id))
    .where(
      and(
        eq(exams.id, examId),
        eq(attempts.isPreview, false),
        eq(questionVersions.questionId, questionId),
        // Only attempts that have finished being graded; in-progress ones aren't graded yet.
        inArray(attempts.state, ["graded", "submitted"]),
      ),
    );

  const diffs = regradeItems(
    rows.map((r) => ({
      itemId: r.itemId,
      attemptId: r.attemptId,
      attemptSeed: r.attemptSeed,
      oldVersionId: r.oldVersionId,
      type: target.question_versions.type,
      newDef: target.question_versions.def,
      response: r.response ?? null,
      points: r.max ?? 0,
      oldScore: r.oldScore ?? 0,
    })),
  );
  return { manual: false as const, targetVersionId: target.question_versions.id, diffs };
}

export type RegradePreview =
  | { ok: true; changed: number; total: number; diffs: { attemptId: string; oldScore: number; newScore: number; delta: number }[] }
  | { ok: false; error: string };

export async function previewRegrade(scope: Scope, examId: string, questionId: string, targetVersion: number): Promise<RegradePreview> {
  const g = await gather(db, scope, examId, questionId, targetVersion);
  if (!g) return { ok: false, error: "That version doesn't exist." };
  if (g.manual) return { ok: false, error: "Written answers are marked by hand and can't be regraded automatically." };
  const diffs = g.diffs.map(({ attemptId, oldScore, newScore, delta }) => ({ attemptId, oldScore, newScore, delta }));
  return { ok: true, changed: diffs.filter((d) => d.delta !== 0).length, total: diffs.length, diffs };
}

/** Write the regrade: new instance, version and grade per item, recomputed attempt totals. */
export async function applyRegrade(
  user: CurrentUser,
  input: { examId: string; questionId: string; targetVersion: number; reason: string },
): Promise<ActionResult<{ changed: number }>> {
  if (!input.reason.trim()) return { ok: false, error: "Give a reason. It goes in the audit log." };
  const scope = await scopeFor(user);
  // Diffs are computed inside the transaction, with the exam's attempts locked,
  // so a marker saving at the same moment can't be overwritten with stale scores.
  return db.transaction(async (tx) => {
    await tx.select({ id: attempts.id }).from(attempts).where(eq(attempts.examId, input.examId)).for("update");
    const g = await gather(tx, scope, input.examId, input.questionId, input.targetVersion);
    if (!g) return { ok: false as const, error: "That version doesn't exist." };
    if (g.manual) return { ok: false as const, error: "Written answers are marked by hand and can't be regraded automatically." };

    const changed = g.diffs.filter((d) => d.delta !== 0);
    for (const d of g.diffs as RegradeDiff[]) {
      await tx.update(attemptItems).set({ instance: d.instance, questionVersionId: g.targetVersionId }).where(eq(attemptItems.id, d.itemId));
      await tx
        .update(grades)
        .set({ score: d.newScore, lines: d.lines, needsReview: d.needsReview, gradedBy: "auto" })
        .where(eq(grades.attemptItemId, d.itemId));
    }
    // Totals, max and state are recomputed from the stored grades: a regrade can
    // change a question's points, or send an answer back for review.
    for (const attemptId of new Set(g.diffs.map((d) => d.attemptId))) {
      const all = await tx
        .select({ score: grades.score, max: grades.max, needsReview: grades.needsReview })
        .from(grades)
        .innerJoin(attemptItems, eq(attemptItems.id, grades.attemptItemId))
        .where(eq(attemptItems.attemptId, attemptId));
      const total = all.reduce((s, r) => s + r.score, 0);
      const max = all.reduce((s, r) => s + r.max, 0);
      await tx
        .update(attempts)
        .set({
          score: Math.round(total * 10_000) / 10_000,
          maxScore: Math.round(max * 10_000) / 10_000,
          state: all.some((r) => r.needsReview) ? "submitted" : "graded",
        })
        .where(eq(attempts.id, attemptId));
    }
    await writeAudit(
      {
        orgId: user.orgId,
        actorId: user.id,
        action: "exam.regrade",
        entityType: "exam",
        entityId: input.examId,
        before: Object.fromEntries(changed.map((d) => [d.attemptId, d.oldScore])),
        after: { questionId: input.questionId, version: input.targetVersion, scores: Object.fromEntries(changed.map((d) => [d.attemptId, d.newScore])) },
        reason: input.reason.trim(),
      },
      tx,
    );
    return { ok: true as const, changed: changed.length };
  });
}
