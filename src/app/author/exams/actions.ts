"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import type { ExamStateName } from "@/engine/exam-state";
import { createCodes } from "@/server/attempts/codes";
import { startPreviewAttempt } from "@/server/attempts/start";
import { createExam, publishExam, saveExam, setExamState, unpublishExam } from "@/server/authoring/exams";

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

export async function setExamStateAction(examId: string, to: ExamStateName) {
  const user = await requireRole("admin", "instructor");
  return done(await setExamState(user, examId, to));
}

export async function createCodesAction(examId: string, n: number) {
  const user = await requireRole("admin", "instructor");
  return createCodes(user, examId, n);
}

export async function startPreviewAction(examId: string) {
  const user = await requireRole("admin", "instructor");
  return startPreviewAttempt(user, examId);
}
