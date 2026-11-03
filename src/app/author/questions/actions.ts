"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { restoreVersion, saveQuestion } from "@/server/authoring/questions";

export async function saveQuestionAction(input: unknown) {
  const user = await requireRole("admin", "instructor");
  const result = await saveQuestion(user, input);
  if (result.ok) revalidatePath("/author", "layout");
  return result;
}

export async function restoreVersionAction(questionId: string, version: number) {
  const user = await requireRole("admin", "instructor");
  const result = await restoreVersion(user, questionId, version);
  if (result.ok) revalidatePath("/author", "layout");
  return result;
}
