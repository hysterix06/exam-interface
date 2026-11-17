import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { attemptItems, attempts, events, exams, extensions, questionVersions, responses } from "@/db/schema";
import { effectiveItemTime, GRACE_MS, itemDeadline } from "@/engine/attempts/deadline";
import { examSettingsSchema } from "@/engine/exam";
import { getQuestionType } from "@/question-types/registry";
import type { CurrentUser } from "@/server/auth";
import type { ActionResult } from "@/server/authoring/questions";
import { attemptExpired, finalizeStoredAttempt, getOwnAttempt, windowClosed } from "./take";

const saveSchema = z.object({
  attemptId: z.guid(),
  itemId: z.guid(),
  // Generous for spreadsheets and long answers; stops a runaway client.
  response: z.unknown().refine((r) => JSON.stringify(r ?? null).length <= 200_000, "That answer is too large."),
  seq: z.number().int().min(0),
});

export type SaveResult = ActionResult<{ applied: boolean }> | { ok: false; error: string; closed: true } | { ok: false; error: string; locked: true };

type Attempt = typeof attempts.$inferSelect;
type Exam = typeof exams.$inferSelect;

/**
 * In a sequential attempt only the current question takes answers, and a
 * timed question stops taking them when its time (plus a few seconds of grace)
 * is up. Returns why a save is refused, or null.
 */
export async function sequentialLock(attempt: Attempt, exam: Exam, item: { position: number; openedAt: Date | null; lockedAt: Date | null }) {
  if (attempt.cursor === null) return null;
  if (item.position !== attempt.cursor || item.lockedAt) return "You've moved past this question, so it can't be changed.";
  const settings = examSettingsSchema.parse(exam.settings);
  if (settings.questionTimeLimitSeconds === null) return null;
  const exts = await db
    .select({ kind: extensions.kind, value: extensions.value })
    .from(extensions)
    .where(and(eq(extensions.userId, attempt.userId), or(isNull(extensions.examId), eq(extensions.examId, exam.id))));
  const end = itemDeadline(item.openedAt, effectiveItemTime(settings.questionTimeLimitSeconds, exts)?.seconds ?? null);
  return end && Date.now() > end.getTime() + GRACE_MS ? "Time for this question is up." : null;
}

/** Load an editable attempt, finalizing it first if the clock ran out. */
export async function editable(user: CurrentUser, attemptId: string) {
  const own = await getOwnAttempt(user, attemptId);
  if (!own) return { kind: "missing" } as const;
  if (own.attempt.state !== "in_progress") return { kind: "closed" } as const;
  const now = new Date();
  if (attemptExpired(own.attempt, now) || (!own.attempt.isPreview && windowClosed(own.exam, now))) {
    await finalizeStoredAttempt(attemptId);
    return { kind: "closed" } as const;
  }
  return { kind: "ok", attempt: own.attempt, exam: own.exam } as const;
}

export async function saveResponse(user: CurrentUser, raw: unknown): Promise<SaveResult> {
  const input = saveSchema.safeParse(raw);
  if (!input.success) return { ok: false, error: "That save was malformed." };
  const { attemptId, itemId, response, seq } = input.data;

  const state = await editable(user, attemptId);
  if (state.kind === "missing") return { ok: false, error: "That attempt doesn't exist." };
  if (state.kind === "closed") return { ok: false, error: "This attempt has ended.", closed: true };

  const [item] = await db
    .select({ type: questionVersions.type, position: attemptItems.position, openedAt: attemptItems.openedAt, lockedAt: attemptItems.lockedAt })
    .from(attemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .where(and(eq(attemptItems.id, itemId), eq(attemptItems.attemptId, attemptId)))
    .limit(1);
  if (!item) return { ok: false, error: "That question isn't part of this attempt." };
  const locked = await sequentialLock(state.attempt, state.exam, item);
  if (locked) return { ok: false, error: locked, locked: true };

  const type = getQuestionType(item.type);
  // Uploaded-file answers are only ever written by the server, from the file itself.
  if (type.serverResponse) return { ok: false, error: "Upload the file to answer this question." };
  const parsed = type.responseSchema.safeParse(response);
  if (!parsed.success) return { ok: false, error: "That answer isn't valid for this question." };
  const saved = await writeResponse(itemId, parsed.data, seq);
  await touch(attemptId);
  return saved;
}

/** "Last seen" for the live board, written at most every 20 seconds per attempt. */
export async function touch(attemptId: string) {
  await db
    .update(attempts)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(attempts.id, attemptId), or(isNull(attempts.lastSeenAt), lt(attempts.lastSeenAt, sql`now() - interval '20 seconds'`))));
}

/** Store a validated response; a late, out-of-order save (older seq) leaves the newer answer in place. */
export async function writeResponse(itemId: string, response: unknown, seq: number): Promise<SaveResult> {
  const written = await db
    .insert(responses)
    .values({ attemptItemId: itemId, response, seq })
    .onConflictDoUpdate({
      target: responses.attemptItemId,
      set: { response, seq, updatedAt: new Date() },
      setWhere: lt(responses.seq, seq),
    })
    .returning({ id: responses.id });
  return { ok: true, applied: written.length > 0 };
}

export async function setFlag(
  user: CurrentUser,
  input: { attemptId: string; itemId: string; flagged: boolean },
): Promise<SaveResult> {
  if (!z.guid().safeParse(input.attemptId).success || !z.guid().safeParse(input.itemId).success) {
    return { ok: false, error: "That attempt doesn't exist." };
  }
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

const EVENT_TYPES = ["blur", "focus", "paste", "offline", "online", "idle", "active", "view"] as const;

/** Integrity signals: recorded for the instructor, never enforced. */
export async function logEvent(user: CurrentUser, input: { attemptId: string; type: string; payload?: unknown }) {
  if (!(EVENT_TYPES as readonly string[]).includes(input.type)) return;
  if (!z.guid().safeParse(input.attemptId).success) return;
  const payload = input.payload === undefined || JSON.stringify(input.payload).length > 2_000 ? null : input.payload;
  const own = await getOwnAttempt(user, input.attemptId);
  if (!own || own.attempt.state !== "in_progress" || own.attempt.isPreview) return;
  await db.insert(events).values({ attemptId: input.attemptId, type: input.type, payload });
}

export async function submitAttempt(user: CurrentUser, attemptId: string): Promise<ActionResult> {
  if (!z.guid().safeParse(attemptId).success) return { ok: false, error: "That attempt doesn't exist." };
  const own = await getOwnAttempt(user, attemptId);
  if (!own) return { ok: false, error: "That attempt doesn't exist." };
  await finalizeStoredAttempt(attemptId);
  return { ok: true };
}

