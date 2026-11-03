import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { attemptItems, attempts, exams, grades, questions, questionVersions, responses } from "@/db/schema";
import { type RegradeDiff, regradeItems } from "@/engine/regrade";
import { questionLabel } from "@/lib/question-label";
import { getQuestionType } from "@/question-types/registry";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";
import type { ActionResult } from "@/server/authoring/questions";

/** Machine-graded questions that real students answered in this exam, with their versions. */
export async function listRegradable(orgId: string, examId: string) {
  const used = await db
    .selectDistinct({ questionId: questionVersions.questionId, type: questionVersions.type })
    .from(attemptItems)
    .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
    .innerJoin(exams, eq(exams.id, attempts.examId))
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .where(and(eq(exams.id, examId), eq(exams.orgId, orgId), eq(attempts.isPreview, false)));
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

async function gather(orgId: string, examId: string, questionId: string, targetVersion: number) {
  const [target] = await db
    .select()
    .from(questionVersions)
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .where(and(eq(questionVersions.questionId, questionId), eq(questionVersions.version, targetVersion), eq(questions.orgId, orgId)))
    .limit(1);
  if (!target) return null;
  if (getQuestionType(target.question_versions.type).manual) return { manual: true as const };

  const rows = await db
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
        eq(exams.orgId, orgId),
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

export async function previewRegrade(orgId: string, examId: string, questionId: string, targetVersion: number): Promise<RegradePreview> {
  const g = await gather(orgId, examId, questionId, targetVersion);
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
  const g = await gather(user.orgId, input.examId, input.questionId, input.targetVersion);
  if (!g) return { ok: false, error: "That version doesn't exist." };
  if (g.manual) return { ok: false, error: "Written answers are marked by hand and can't be regraded automatically." };

  const changed = g.diffs.filter((d) => d.delta !== 0);
  await db.transaction(async (tx) => {
    for (const d of g.diffs as RegradeDiff[]) {
      await tx.update(attemptItems).set({ instance: d.instance, questionVersionId: g.targetVersionId }).where(eq(attemptItems.id, d.itemId));
      await tx
        .update(grades)
        .set({ score: d.newScore, lines: d.lines, needsReview: d.needsReview, gradedBy: "auto" })
        .where(eq(grades.attemptItemId, d.itemId));
    }
    for (const attemptId of new Set(changed.map((d) => d.attemptId))) {
      const all = await tx
        .select({ score: grades.score })
        .from(grades)
        .innerJoin(attemptItems, eq(attemptItems.id, grades.attemptItemId))
        .where(eq(attemptItems.attemptId, attemptId));
      const total = all.reduce((s, r) => s + r.score, 0);
      await tx.update(attempts).set({ score: Math.round(total * 10_000) / 10_000 }).where(eq(attempts.id, attemptId));
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
  });
  return { ok: true, changed: changed.length };
}
