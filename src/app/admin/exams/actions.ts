"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { addExtension, loadLive, setSchedule } from "@/server/admin/data";
import { applyRegrade, previewRegrade } from "@/server/admin/regrade";

export async function liveAction(examId: string) {
  const user = await requireRole("admin", "instructor");
  return loadLive(user.orgId, examId);
}

export async function addExtensionAction(input: Parameters<typeof addExtension>[1]) {
  const user = await requireRole("admin", "instructor");
  const r = await addExtension(user, input);
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

export async function setScheduleAction(input: Parameters<typeof setSchedule>[1]) {
  const user = await requireRole("admin", "instructor");
  const r = await setSchedule(user, input);
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

export async function previewRegradeAction(examId: string, questionId: string, version: number) {
  const user = await requireRole("admin", "instructor");
  return previewRegrade(user.orgId, examId, questionId, version);
}

export async function applyRegradeAction(input: Parameters<typeof applyRegrade>[1]) {
  const user = await requireRole("admin", "instructor");
  const r = await applyRegrade(user, input);
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}
