"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { submitAssignment, uploadAssignmentFile } from "@/server/assignments/submit";

/** One file at a time, so each upload stays well under the request size limit. */
export async function uploadAssignmentFileAction(form: FormData) {
  const user = await requireRole("student");
  const assignmentId = String(form.get("assignmentId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "Choose a file." };
  return uploadAssignmentFile(user, assignmentId, file);
}

export async function submitAssignmentAction(assignmentId: string, input: unknown) {
  const user = await requireRole("student");
  const r = await submitAssignment(user, assignmentId, input);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
