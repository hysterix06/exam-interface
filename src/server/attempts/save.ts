import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { attemptItems, events, questionVersions, responses } from "@/db/schema";
import { isExpired } from "@/engine/attempts/deadline";
import { getQuestionType } from "@/question-types/registry";
import type { CurrentUser } from "@/server/auth";
import type { ActionResult } from "@/server/authoring/questions";
import { finalizeStoredAttempt, getOwnAttempt, windowClosed } from "./take";

const saveSchema = z.object({
  attemptId: z.uuid(),
  itemId: z.uuid(),
  response: z.unknown(),
  seq: z.number().int().min(0),
});

export type SaveResult = ActionResult<{ applied: boolean }> | { ok: false; error: string; closed: true };

/** Load an editable attempt, finalizing it first if the clock ran out. */
async function editable(user: CurrentUser, attemptId: string) {
  const own = await getOwnAttempt(user, attemptId);
  if (!own) return { kind: "missing" } as const;
  if (own.attempt.state !== "in_progress") return { kind: "closed" } as const;
  const now = new Date();
  if (isExpired(own.attempt.deadlineAt, now) || (!own.attempt.isPreview && windowClosed(own.exam, now))) {
    await finalizeStoredAttempt(attemptId);
    return { kind: "closed" } as const;
  }
  return { kind: "ok" } as const;
}

export async function saveResponse(user: CurrentUser, raw: unknown): Promise<SaveResult> {
  const input = saveSchema.safeParse(raw);
  if (!input.success) return { ok: false, error: "That save was malformed." };
  const { attemptId, itemId, response, seq } = input.data;

  const state = await editable(user, attemptId);
  if (state.kind === "missing") return { ok: false, error: "That attempt doesn't exist." };
  if (state.kind === "closed") return { ok: false, error: "This attempt has ended.", closed: true };

  const [item] = await db
    .select({ type: questionVersions.type })
    .from(attemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .where(and(eq(attemptItems.id, itemId), eq(attemptItems.attemptId, attemptId)))
    .limit(1);
  if (!item) return { ok: false, error: "That question isn't part of this attempt." };

  const parsed = getQuestionType(item.type).responseSchema.safeParse(response);
  if (!parsed.success) return { ok: false, error: "That answer isn't valid for this question." };

  // A late, out-of-order save (older seq) leaves the newer answer in place.
  const written = await db
    .insert(responses)
    .values({ attemptItemId: itemId, response: parsed.data, seq })
    .onConflictDoUpdate({
      target: responses.attemptItemId,
      set: { response: parsed.data, seq, updatedAt: new Date() },
      setWhere: lt(responses.seq, seq),
    })
    .returning({ id: responses.id });
  return { ok: true, applied: written.length > 0 };
}

export async function setFlag(
  user: CurrentUser,
  input: { attemptId: string; itemId: string; flagged: boolean },
): Promise<SaveResult> {
  const state = await editable(user, input.attemptId);
  if (state.kind === "missing") return { ok: false, error: "That attempt doesn't exist." };
  if (state.kind === "closed") return { ok: false, error: "This attempt has ended.", closed: true };
  const updated = await db
    .update(attemptItems)
    .set({ flagged: input.flagged })
    .where(and(eq(attemptItems.id, input.itemId), eq(attemptItems.attemptId, input.attemptId)))
    .returning({ id: attemptItems.id });
  return updated.length ? { ok: true, applied: true } : { ok: false, error: "That question isn't part of this attempt." };
}

const EVENT_TYPES = ["blur", "focus", "paste", "offline", "online", "idle"] as const;

/** Integrity signals: recorded for the instructor, never enforced. */
export async function logEvent(user: CurrentUser, input: { attemptId: string; type: string; payload?: unknown }) {
  if (!(EVENT_TYPES as readonly string[]).includes(input.type)) return;
  const own = await getOwnAttempt(user, input.attemptId);
  if (!own || own.attempt.state !== "in_progress" || own.attempt.isPreview) return;
  await db.insert(events).values({ attemptId: input.attemptId, type: input.type, payload: input.payload ?? null });
}

export async function submitAttempt(user: CurrentUser, attemptId: string): Promise<ActionResult> {
  const own = await getOwnAttempt(user, attemptId);
  if (!own) return { ok: false, error: "That attempt doesn't exist." };
  await finalizeStoredAttempt(attemptId);
  return { ok: true };
}

