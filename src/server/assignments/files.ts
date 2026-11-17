import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assignments, submissions } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { canTeach, scopeFor } from "@/server/access";
import type { CurrentUser } from "@/server/auth";
import { SUBMISSION_BUCKET, type SubmissionFile } from "./submit";

const SIGNED_URL_SECONDS = 300;

/**
 * One file of a hand-in, if this person may see it: the student who handed
 * it in, or someone who teaches the course. Anything else is "not found".
 */
export async function submissionFileForViewer(user: CurrentUser, submissionId: string, index: number): Promise<SubmissionFile | null> {
  const [row] = await db
    .select({ userId: submissions.userId, files: submissions.files, courseId: assignments.courseId })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(and(eq(submissions.id, submissionId), eq(assignments.orgId, user.orgId)))
    .limit(1);
  if (!row) return null;
  const allowed = user.role === "student" ? row.userId === user.id : canTeach(await scopeFor(user), row.courseId);
  if (!allowed) return null;
  return (row.files as SubmissionFile[])[index] ?? null;
}

/** A 5-minute link; `download` makes the browser save it under its own name. */
export async function signedSubmissionUrl(file: SubmissionFile, download: boolean) {
  const { data, error } = await createAdminClient()
    .storage.from(SUBMISSION_BUCKET)
    .createSignedUrl(file.path, SIGNED_URL_SECONDS, download ? { download: file.name } : undefined);
  return error ? null : data.signedUrl;
}

export { SIGNED_URL_SECONDS };
