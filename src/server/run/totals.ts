import "server-only";
import { eq } from "drizzle-orm";
import type { db } from "@/db/client";
import { attemptItems, attempts, grades } from "@/db/schema";
import { type LatePenalty, reapplyPenalty } from "@/engine/attempts/late";

type Tx = Pick<typeof db, "select" | "update">;

/**
 * Recompute an attempt's total, max and state from its stored grades. Every
 * write that changes a grade (regrade, marking, override) calls this, so the
 * attempt row can never disagree with its items.
 */
export async function recomputeAttempt(tx: Tx, attemptId: string) {
  const all = await tx
    .select({ score: grades.score, max: grades.max, needsReview: grades.needsReview })
    .from(grades)
    .innerJoin(attemptItems, eq(attemptItems.id, grades.attemptItemId))
    .where(eq(attemptItems.attemptId, attemptId));
  const total = all.reduce((s, r) => s + r.score, 0);
  const max = all.reduce((s, r) => s + r.max, 0);
  // A late penalty is a share of what was earned, so it follows the new total.
  const [row] = await tx.select({ latePenalty: attempts.latePenalty }).from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  const late = row?.latePenalty ? reapplyPenalty(row.latePenalty as LatePenalty, Math.round(total * 10_000) / 10_000) : null;
  await tx
    .update(attempts)
    .set({
      latePenalty: late,
      score: Math.round((total - (late?.points ?? 0)) * 10_000) / 10_000,
      maxScore: Math.round(max * 10_000) / 10_000,
      state: all.some((r) => r.needsReview) ? "submitted" : "graded",
    })
    .where(eq(attempts.id, attemptId));
}
