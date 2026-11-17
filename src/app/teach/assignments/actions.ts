"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/access";
import {
  createAssignment,
  deleteAssignment,
  publishAssignment,
  saveAssignment,
  setExtension,
  setReleased,
  unpublishAssignment,
} from "@/server/assignments/authoring";
import { markSubmission } from "@/server/assignments/marking";

// Every action re-authorizes; the server functions check the assignment is in your courses.
const done = <T extends { ok: boolean }>(r: T) => {
  if (r.ok) revalidatePath("/", "layout");
  return r;
};

export async function createAssignmentAction(input: { courseId: string; title: string }) {
  const { user, scope } = await requireStaff();
  return done(await createAssignment(user, scope, input));
}

export async function saveAssignmentAction(input: unknown) {
  const { user, scope } = await requireStaff();
  return done(await saveAssignment(user, scope, input));
}

export async function publishAssignmentAction(id: string) {
  const { user, scope } = await requireStaff();
  return done(await publishAssignment(user, scope, id));
}

export async function unpublishAssignmentAction(id: string) {
  const { user, scope } = await requireStaff();
  return done(await unpublishAssignment(user, scope, id));
}

export async function deleteAssignmentAction(id: string) {
  const { user, scope } = await requireStaff();
  return done(await deleteAssignment(user, scope, id));
}

export async function setReleasedAction(id: string, released: boolean) {
  const { user, scope } = await requireStaff();
  return done(await setReleased(user, scope, id, released === true));
}

export async function setExtensionAction(input: { assignmentId: string; userId: string; dueAt: string | null; reason?: string }) {
  const { user, scope } = await requireStaff();
  return done(await setExtension(user, scope, input));
}

export async function markSubmissionAction(assignmentId: string, input: unknown) {
  const { user, scope } = await requireStaff();
  return done(await markSubmission(user, scope, assignmentId, input));
}
