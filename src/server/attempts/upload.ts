import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attemptItems, questionVersions, responses } from "@/db/schema";
import { sniffFile } from "@/engine/image-size";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseWorkbook } from "@/lib/xlsx";
import { fileTask, type FileTaskInstance, type FileTaskResponse, MAX_UPLOAD_BYTES } from "@/question-types/file-task/core";
import type { CurrentUser } from "@/server/auth";
import { editable, sequentialLock, touch, writeResponse } from "./save";
import { getOwnAttempt } from "./take";

export const SUBMISSION_BUCKET = "submissions";

export type UploadResult = { ok: true; response: FileTaskResponse } | { ok: false; error: string; closed?: true };

/**
 * A student's workbook for an upload question: checked, parsed into cells and
 * saved as their answer (the file itself is kept privately for the record).
 * The only way a file-task answer is ever written.
 */
export async function uploadSubmission(user: CurrentUser, attemptId: string, itemId: string, file: File): Promise<UploadResult> {
  const state = await editable(user, attemptId);
  if (state.kind === "missing") return { ok: false, error: "That attempt doesn't exist." };
  if (state.kind === "closed") return { ok: false, error: "This attempt has ended.", closed: true };
  const own = (await getOwnAttempt(user, attemptId))!;

  const [item] = await db
    .select({ type: questionVersions.type, instance: attemptItems.instance, seq: responses.seq, position: attemptItems.position, openedAt: attemptItems.openedAt, lockedAt: attemptItems.lockedAt })
    .from(attemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
    .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
    .where(and(eq(attemptItems.id, itemId), eq(attemptItems.attemptId, attemptId)))
    .limit(1);
  if (!item || item.type !== fileTask.id) return { ok: false, error: "That question doesn't take a file." };
  const locked = await sequentialLock(own.attempt, own.exam, item);
  if (locked) return { ok: false, error: locked };
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Workbooks can be at most 2 MB." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniffFile(bytes)?.kind !== "workbook") return { ok: false, error: "Upload an Excel workbook (.xlsx). Older .xls files and CSV aren't accepted." };
  const inst = item.instance as FileTaskInstance;
  const parsed = await parseWorkbook(bytes, { rows: inst.rows, cols: inst.cols, sheetName: inst.sheetName || undefined });
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = `org/${own.attempt.orgId}/attempt/${attemptId}/${itemId}/${sha256}.xlsx`;
  const { error } = await createAdminClient().storage.from(SUBMISSION_BUCKET).upload(path, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: true,
  });
  if (error) return { ok: false, error: "The file couldn't be stored. Try again in a moment." };

  const response: FileTaskResponse = { fileName: file.name.slice(0, 200) || "upload.xlsx", sha256, bytes: bytes.length, cells: parsed.cells, warnings: parsed.warnings };
  const saved = await writeResponse(itemId, response, (item.seq ?? 0) + 1);
  if (!saved.ok) return { ok: false, error: saved.error };
  await touch(attemptId);
  return { ok: true, response };
}

/** Staff: read a model-solution workbook into cells for the editor (nothing is stored). */
export async function readSolutionWorkbook(file: File, opts: { rows: number; cols: number; sheetName?: string }) {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false as const, error: "Workbooks can be at most 2 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniffFile(bytes)?.kind !== "workbook") return { ok: false as const, error: "Choose an Excel workbook (.xlsx)." };
  const parsed = await parseWorkbook(bytes, opts);
  return "error" in parsed ? { ok: false as const, error: parsed.error } : { ok: true as const, cells: parsed.cells, warnings: parsed.warnings };
}
