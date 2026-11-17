"use server";

import { z } from "zod";
import { requireRole } from "@/server/auth";
import { logEvent, saveResponse, setFlag, submitAttempt } from "@/server/attempts/save";
import { startAttempt } from "@/server/attempts/start";
import { advanceAttempt, attemptClock } from "@/server/attempts/take";
import { uploadSubmission } from "@/server/attempts/upload";

export async function startAttemptAction(examId: string, code?: string) {
  const user = await requireRole("student");
  if (!z.guid().safeParse(examId).success) return { ok: false as const, error: "That exam doesn't exist." };
  return startAttempt(user, examId, typeof code === "string" ? code.slice(0, 40) : undefined);
}

// Staff run previews through the same screen, so these accept every role; the
// server functions only ever touch attempts the caller owns.
export async function saveResponseAction(input: unknown) {
  return saveResponse(await requireRole(), input);
}

export async function setFlagAction(input: { attemptId: string; itemId: string; flagged: boolean }) {
  return setFlag(await requireRole(), input);
}

export async function logEventAction(input: { attemptId: string; type: string; payload?: unknown }) {
  await logEvent(await requireRole(), input);
}

export async function submitAttemptAction(attemptId: string) {
  return submitAttempt(await requireRole(), attemptId);
}

/** The live deadline (extensions granted mid-attempt move it), or "finished". */
export async function attemptClockAction(attemptId: string) {
  if (!z.guid().safeParse(attemptId).success) return { finished: true as const };
  return attemptClock(await requireRole(), attemptId);
}

/** A workbook for an upload question (FormData: attemptId, itemId, file). */
export async function uploadSubmissionAction(form: FormData) {
  const user = await requireRole();
  const attemptId = form.get("attemptId");
  const itemId = form.get("itemId");
  const file = form.get("file");
  if (typeof attemptId !== "string" || typeof itemId !== "string" || !z.guid().safeParse(attemptId).success || !z.guid().safeParse(itemId).success) {
    return { ok: false as const, error: "That attempt doesn't exist." };
  }
  if (!(file instanceof File)) return { ok: false as const, error: "Choose a file." };
  return uploadSubmission(user, attemptId, itemId, file);
}

/** Sequential attempts: lock the current question and open the next. */
export async function advanceAttemptAction(attemptId: string, fromPosition: number) {
  if (!z.guid().safeParse(attemptId).success || !Number.isInteger(fromPosition) || fromPosition < 0) return { ok: false as const, error: "That attempt doesn't exist." };
  return advanceAttempt(await requireRole(), attemptId, fromPosition);
}
