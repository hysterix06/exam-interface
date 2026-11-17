import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, enrollments } from "@/db/schema";
import { sniffFile } from "@/engine/image-size";
import { createAdminClient } from "@/lib/supabase/admin";
import { canTeach, scopeFor } from "@/server/access";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";
import type { ActionResult } from "@/server/authoring/questions";

export const ASSET_BUCKET = "assets";
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
/** Signed download links last this long; the route hands out a fresh one each time. */
export const SIGNED_URL_SECONDS = 300;

export interface AssetSummary {
  id: string;
  fileName: string;
  kind: string;
  width: number | null;
  height: number | null;
  bytes: number;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/**
 * Store one uploaded file for a course. The type comes from the file's own
 * bytes, never the browser; identical files are stored once per course.
 */
export async function uploadAsset(user: CurrentUser, courseId: string, file: File): Promise<ActionResult<{ asset: AssetSummary }>> {
  const scope = await scopeFor(user);
  if (!canTeach(scope, courseId)) return { ok: false, error: "Choose one of your courses." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_ASSET_BYTES) return { ok: false, error: "Files can be at most 5 MB." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFile(bytes);
  if (!kind) return { ok: false, error: "Upload a PNG, JPEG or WebP image, or an .xlsx workbook. (SVG isn't accepted.)" };
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const [existing] = await db.select().from(assets).where(and(eq(assets.courseId, courseId), eq(assets.sha256, sha256))).limit(1);
  if (existing) return { ok: true, asset: summary(existing) };

  const path = `org/${user.orgId}/course/${courseId}/${sha256}.${EXT[kind.mime]}`;
  const { error } = await createAdminClient().storage.from(ASSET_BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: true });
  if (error) return { ok: false, error: "The file couldn't be stored. Try again in a moment." };

  const [row] = await db
    .insert(assets)
    .values({
      orgId: user.orgId,
      courseId,
      kind: kind.kind,
      path,
      fileName: file.name.slice(0, 200) || `upload.${EXT[kind.mime]}`,
      mime: kind.mime,
      bytes: bytes.length,
      width: kind.kind === "image" ? kind.width : null,
      height: kind.kind === "image" ? kind.height : null,
      sha256,
      createdBy: user.id,
    })
    .onConflictDoNothing()
    .returning();
  const stored = row ?? (await db.select().from(assets).where(and(eq(assets.courseId, courseId), eq(assets.sha256, sha256))).limit(1))[0];
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "asset.upload", entityType: "asset", entityId: stored.id, after: { fileName: stored.fileName, bytes: stored.bytes } });
  return { ok: true, asset: summary(stored) };
}

/** A course's uploads, newest first, for the picker. */
export async function listAssets(user: CurrentUser, courseId: string, kind?: string): Promise<AssetSummary[]> {
  const scope = await scopeFor(user);
  if (!canTeach(scope, courseId)) return [];
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.courseId, courseId), eq(assets.orgId, user.orgId), kind ? eq(assets.kind, kind) : undefined))
    .orderBy(desc(assets.createdAt))
    .limit(200);
  return rows.map(summary);
}

/**
 * Who may download an asset: staff who teach its course, and students
 * enrolled in it (they see it inside their exam). Anything else is "not found".
 */
export async function assetForViewer(user: CurrentUser, id: string) {
  const [row] = await db.select().from(assets).where(and(eq(assets.id, id), eq(assets.orgId, user.orgId))).limit(1);
  if (!row) return null;
  if (user.role === "student") {
    const [enrolled] = await db
      .select({ courseId: enrollments.courseId })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, row.courseId), eq(enrollments.userId, user.id)))
      .limit(1);
    return enrolled ? row : null;
  }
  return canTeach(await scopeFor(user), row.courseId) ? row : null;
}

export async function signedAssetUrl(path: string, download?: string) {
  const { data, error } = await createAdminClient().storage.from(ASSET_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS, download ? { download } : undefined);
  return error ? null : data.signedUrl;
}

function summary(r: typeof assets.$inferSelect): AssetSummary {
  return { id: r.id, fileName: r.fileName, kind: r.kind, width: r.width, height: r.height, bytes: r.bytes };
}
