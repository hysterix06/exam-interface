"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { createExam, publishExam, saveExam, unpublishExam } from "@/server/authoring/exams";

const done = <T extends { ok: boolean }>(r: T) => {
  if (r.ok) revalidatePath("/author", "layout");
  return r;
};

export async function createExamAction(input: { courseId: string; title: string }) {
  const user = await requireRole("admin", "instructor");
  return done(await createExam(user, input));
}

export async function saveExamAction(input: unknown) {
  const user = await requireRole("admin", "instructor");
  return done(await saveExam(user, input));
}

export async function publishExamAction(examId: string) {
  const user = await requireRole("admin", "instructor");
  return done(await publishExam(user, examId));
}

export async function unpublishExamAction(examId: string) {
  const user = await requireRole("admin", "instructor");
  return done(await unpublishExam(user, examId));
}
