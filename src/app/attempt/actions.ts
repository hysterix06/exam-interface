"use server";

import { requireRole } from "@/server/auth";
import { logEvent, saveResponse, setFlag, submitAttempt } from "@/server/attempts/save";
import { startAttempt } from "@/server/attempts/start";

export async function startAttemptAction(examId: string, code?: string) {
  const user = await requireRole("student");
  return startAttempt(user, examId, code);
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
