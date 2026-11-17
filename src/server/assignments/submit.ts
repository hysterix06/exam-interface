import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { assignmentExtensions, assignments, courses, enrollments, submissions } from "@/db/schema";
import { lateness } from "@/engine/attempts/late";
import { sniffSubmission } from "@/engine/assignments/files";
import { FILE_KIND_LABEL, MAX_SUBMISSION_FILE_BYTES, parseAssignmentSettings, type SubmissionFileKind } from "@/engine/assignments/settings";
import { assignmentState, canSubmit } from "@/engine/assignments/state";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/server/auth";

export const SUBMISSION_BUCKET = "submissions";

/** A handed-in file, as stored on the submission. */
export interface SubmissionFile {
  path: string;
  name: string;
  mime: string;
  bytes: number;
  sha256: string;
  kind: SubmissionFileKind;
}

/** What the browser holds between uploading a file and handing in. */
export interface UploadedFile {
  sha256: string;
  ext: string;
  name: string;
  bytes: number;
  kind: SubmissionFileKind;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

/** The published assignment, if this student is enrolled in its (live) course; with their own due date. */
async function forStudent(user: Pick<CurrentUser, "id" | "orgId">, assignmentId: string) {
  if (!z.guid().safeParse(assignmentId).success) return null;
  const [row] = await db
    .select({ a: assignments, ext: assignmentExtensions.dueAt })
    .from(assignments)
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .innerJoin(enrollments, and(eq(enrollments.courseId, assignments.courseId), eq(enrollments.userId, user.id), eq(enrollments.role, "student")))
    .leftJoin(assignmentExtensions, and(eq(assignmentExtensions.assignmentId, assignments.id), eq(assignmentExtensions.userId, user.id)))
    .where(and(eq(assignments.id, assignmentId), eq(assignments.orgId, user.orgId), eq(assignments.state, "published"), isNull(courses.archivedAt)))
    .limit(1);
  if (!row) return null;
  const settings = parseAssignmentSettings(row.a.settings);
  const due = row.ext ?? row.a.dueAt;
  const state = assignmentState({ state: row.a.state, opensAt: row.a.opensAt, dueAt: row.a.dueAt, late: settings.late }, new Date(), row.ext);
  return { a: row.a, settings, due, state };
}

const folder = (orgId: string, assignmentId: string, userId: string) => `org/${orgId}/assignment/${assignmentId}/${userId}`;

/** Stores one file for a hand-in still being put together. Files are named by their hash, so re-uploading is harmless. */
export async function uploadAssignmentFile(user: CurrentUser, assignmentId: string, file: File): Promise<Result<{ file: UploadedFile }>> {
  const s = await forStudent(user, assignmentId);
  if (!s) return fail("That assignment isn't available.");
  if (!canSubmit(s.state)) return fail(s.state === "scheduled" ? "This assignment isn't open yet." : "Hand-ins for this assignment have closed.");
  if (!s.settings.allowFiles) return fail("This assignment doesn't take files.");
  if (file.size === 0) return fail("That file is empty.");
  if (file.size > MAX_SUBMISSION_FILE_BYTES) return fail("Files can be at most 10 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffSubmission(bytes);
  const allowed = s.settings.accept.map((k) => FILE_KIND_LABEL[k]).join(", ");
  if (!kind) return fail(`That file type isn't accepted. Allowed: ${allowed}.`);
  if (!s.settings.accept.includes(kind.kind)) return fail(`${FILE_KIND_LABEL[kind.kind]} files aren't accepted here. Allowed: ${allowed}.`);

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = `${folder(s.a.orgId, s.a.id, user.id)}/${sha256}.${kind.ext}`;
  const { error } = await createAdminClient().storage.from(SUBMISSION_BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: true });
  if (error) return fail("The file couldn't be stored. Try again in a moment.");
  return { ok: true, file: { sha256, ext: kind.ext, name: cleanName(file.name, kind.ext), bytes: bytes.length, kind: kind.kind } };
}

/** A display name: no paths or control characters, and the real extension. */
function cleanName(name: string, ext: string) {
  const base = name.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 150) || "file";
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base.replace(/\.[^.]*$/, "")}.${ext}`;
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
};
const EXT_KIND: Record<string, SubmissionFileKind> = { pdf: "pdf", docx: "docx", xlsx: "workbook", png: "image", jpg: "image", webp: "image", txt: "text" };

const submitSchema = z.object({
  text: z.string().max(200_000).transform((s) => s.trim() || null),
  files: z
    .array(z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/), ext: z.enum(Object.keys(MIME) as [string, ...string[]]), name: z.string().max(200) }))
    .max(10),
});

/**
 * Hands work in: a new version each time (when resubmitting is allowed). Every
 * file must already be in the student's own folder (uploaded through
 * uploadAssignmentFile); its size and type come from storage, not the browser.
 */
export async function submitAssignment(user: CurrentUser, assignmentId: string, input: unknown): Promise<Result<{ version: number; late: boolean }>> {
  const s = await forStudent(user, assignmentId);
  if (!s) return fail("That assignment isn't available.");
  if (!canSubmit(s.state)) return fail(s.state === "scheduled" ? "This assignment isn't open yet." : "Hand-ins for this assignment have closed.");
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return fail("Something in the hand-in wasn't right. Reload and try again.");
  const { text, files } = parsed.data;
  if (text && !s.settings.allowText) return fail("This assignment only takes files.");
  if (files.length && !s.settings.allowFiles) return fail("This assignment doesn't take files.");
  if (files.length > s.settings.maxFiles) return fail(`At most ${s.settings.maxFiles} files.`);
  if (!text && files.length === 0) return fail("Add your work before handing in.");

  // Confirm each file is really there, in this student's folder.
  const dir = folder(s.a.orgId, s.a.id, user.id);
  const { data: listed, error } = await createAdminClient().storage.from(SUBMISSION_BUCKET).list(dir, { limit: 1000 });
  if (error) return fail("Your files couldn't be checked. Try again in a moment.");
  const stored: SubmissionFile[] = [];
  for (const f of files) {
    const obj = listed?.find((o) => o.name === `${f.sha256}.${f.ext}`);
    if (!obj) return fail("One of your files didn't finish uploading. Remove it and add it again.");
    const kind = EXT_KIND[f.ext];
    if (!s.settings.accept.includes(kind)) return fail(`${FILE_KIND_LABEL[kind]} files aren't accepted here.`);
    stored.push({ path: `${dir}/${obj.name}`, name: cleanName(f.name, f.ext), mime: MIME[f.ext], bytes: Number(obj.metadata?.size ?? 0), sha256: f.sha256, kind });
  }

  const now = new Date();
  const lateMinutes = lateness(s.due, now);
  const result = await db.transaction(async (tx) => {
    const [prev] = await tx
      .select({ version: submissions.version })
      .from(submissions)
      .where(and(eq(submissions.assignmentId, s.a.id), eq(submissions.userId, user.id)))
      .orderBy(desc(submissions.version))
      .limit(1)
      .for("update");
    // Once grades are out, the marked version stands.
    if (prev && (!s.settings.resubmit || s.a.releasedAt)) return null;
    const version = (prev?.version ?? 0) + 1;
    await tx.insert(submissions).values({ assignmentId: s.a.id, userId: user.id, version, text, files: stored, submittedAt: now, lateMinutes });
    return version;
  });
  if (result === null) return fail(s.a.releasedAt ? "Grades for this assignment are out, so it can't be handed in again." : "You’ve already handed this in, and this assignment takes one hand-in only.");
  return { ok: true, version: result, late: lateMinutes > 0 };
}
