"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ExamStateName } from "@/engine/exam-state";
import { requireStaff } from "@/server/access";
import { createCodes } from "@/server/attempts/codes";
import { startPreviewAttempt } from "@/server/attempts/start";
import { createExam, publishExam, saveExam, setExamState, unpublishExam } from "@/server/authoring/exams";
import { restoreVersion, saveQuestion } from "@/server/authoring/questions";
import { createTopic, deleteTopic, renameTopic } from "@/server/authoring/topics";
import { saveReview } from "@/server/review";
import { addExtension, loadLive, removeExtension, setSchedule } from "@/server/run/data";
import { applyRegrade, previewRegrade } from "@/server/run/regrade";

// Every action re-authorizes; ids from the browser are checked before they
// reach a query, so a malformed one is a polite error rather than a 500.
const id = z.guid();
const STATES = ["draft", "scheduled", "open", "closed", "graded", "released"] as const;
const invalid = { ok: false as const, error: "That item no longer exists." };

const done = <T extends { ok: boolean }>(r: T) => {
  if (r.ok) revalidatePath("/", "layout");
  return r;
};

// Exams

export async function createExamAction(input: { courseId: string; title: string }) {
  const { user } = await requireStaff();
  if (!id.safeParse(input.courseId).success) return { ok: false as const, error: "Choose one of your courses." };
  return done(await createExam(user, input));
}

export async function saveExamAction(input: unknown) {
  const { user } = await requireStaff();
  return done(await saveExam(user, input));
}

export async function publishExamAction(examId: string) {
  const { user } = await requireStaff();
  if (!id.safeParse(examId).success) return invalid;
  return done(await publishExam(user, examId));
}

export async function unpublishExamAction(examId: string) {
  const { user } = await requireStaff();
  if (!id.safeParse(examId).success) return invalid;
  return done(await unpublishExam(user, examId));
}

export async function setExamStateAction(examId: string, to: ExamStateName) {
  const { user } = await requireStaff();
  if (!id.safeParse(examId).success || !STATES.includes(to)) return invalid;
  return done(await setExamState(user, examId, to));
}

export async function createCodesAction(examId: string, n: number) {
  const { user } = await requireStaff();
  if (!id.safeParse(examId).success) return invalid;
  return createCodes(user, examId, n);
}

export async function startPreviewAction(examId: string) {
  const { user } = await requireStaff();
  if (!id.safeParse(examId).success) return invalid;
  return startPreviewAttempt(user, examId);
}

// Running an exam

export async function liveAction(examId: string) {
  const { scope } = await requireStaff();
  if (!id.safeParse(examId).success) return null;
  return loadLive(scope, examId);
}

export async function addExtensionAction(input: unknown) {
  const { user } = await requireStaff();
  return done(await addExtension(user, input));
}

export async function removeExtensionAction(input: { examId: string; extensionId: string }) {
  const { user } = await requireStaff();
  if (!id.safeParse(input.examId).success) return invalid;
  return done(await removeExtension(user, input));
}

export async function setScheduleAction(input: { examId: string; opensAt: string | null; closesAt: string | null }) {
  const { user } = await requireStaff();
  if (!id.safeParse(input.examId).success) return invalid;
  return done(await setSchedule(user, input));
}

export async function previewRegradeAction(examId: string, questionId: string, version: number) {
  const { scope } = await requireStaff();
  if (!id.safeParse(examId).success || !id.safeParse(questionId).success || !Number.isInteger(version)) return invalid;
  return previewRegrade(scope, examId, questionId, version);
}

export async function applyRegradeAction(input: { examId: string; questionId: string; targetVersion: number; reason: string }) {
  const { user } = await requireStaff();
  if (!id.safeParse(input.examId).success || !id.safeParse(input.questionId).success || !Number.isInteger(input.targetVersion)) return invalid;
  return done(await applyRegrade(user, input));
}

// Marking

export async function saveReviewAction(input: { attemptItemId: string; ticked: string[] }) {
  const { user } = await requireStaff();
  if (!id.safeParse(input.attemptItemId).success || !Array.isArray(input.ticked)) return invalid;
  return done(await saveReview(user, { attemptItemId: input.attemptItemId, ticked: input.ticked.filter((t) => typeof t === "string").slice(0, 100) }));
}

// Questions and topics

export async function saveQuestionAction(input: unknown) {
  const { user } = await requireStaff();
  return done(await saveQuestion(user, input));
}

export async function restoreVersionAction(questionId: string, version: number) {
  const { user } = await requireStaff();
  if (!id.safeParse(questionId).success || !Number.isInteger(version)) return invalid;
  return done(await restoreVersion(user, questionId, version));
}

export async function createTopicAction(input: { courseId: string; name: string }) {
  const { user } = await requireStaff();
  return done(await createTopic(user, input));
}

export async function renameTopicAction(input: { id: string; name: string }) {
  const { user } = await requireStaff();
  return done(await renameTopic(user, input));
}

export async function deleteTopicAction(topicId: string) {
  const { user } = await requireStaff();
  return done(await deleteTopic(user, topicId));
}
