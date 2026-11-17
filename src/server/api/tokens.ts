import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { apiTokens, profiles } from "@/db/schema";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";

// Personal access, read-only: API tokens (sent as "Authorization: Bearer …")
// and private calendar feed URLs (the token is in the path, because calendar
// apps can't send headers). Only a sha256 of each secret is stored; the
// secret itself is shown once. A token can never see more than its owner can
// in the app, because every API route calls the same scoped functions.

const PREFIX = { api: "modus_pat_", calendar: "modus_cal_" } as const;
type Kind = keyof typeof PREFIX;

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function randomSecret(kind: Kind) {
  const bytes = randomBytes(32);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % 62];
  return PREFIX[kind] + s;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function listTokens(user: Pick<CurrentUser, "id">) {
  return db
    .select({ id: apiTokens.id, kind: apiTokens.kind, name: apiTokens.name, prefix: apiTokens.prefix, lastUsedAt: apiTokens.lastUsedAt, expiresAt: apiTokens.expiresAt, createdAt: apiTokens.createdAt })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, user.id), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
}

const createSchema = z.object({ name: z.string().trim().min(1, "Name the token, e.g. “Laptop script”.").max(80), expiresInDays: z.number().int().min(1).max(366).nullable() });

/** A new read-only API token. The secret is returned once and never again. */
export async function createApiToken(user: CurrentUser, input: unknown): Promise<Result<{ secret: string }>> {
  const p = createSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form." };
  const live = await listTokens(user);
  if (live.filter((t) => t.kind === "api").length >= 20) return { ok: false, error: "You have 20 tokens already. Revoke one first." };
  const secret = randomSecret("api");
  const expiresAt = p.data.expiresInDays ? new Date(Date.now() + p.data.expiresInDays * 86_400_000) : null;
  const [row] = await db.insert(apiTokens).values({ userId: user.id, kind: "api", name: p.data.name, tokenHash: hash(secret), prefix: secret.slice(0, 14), expiresAt }).returning({ id: apiTokens.id });
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "token.create", entityType: "api_token", entityId: row.id, after: { name: p.data.name, expiresAt } });
  return { ok: true, secret };
}

/** The calendar feed: one per person. Making a new one turns the old URL off. */
export async function resetCalendarFeed(user: CurrentUser): Promise<{ secret: string }> {
  const secret = randomSecret("calendar");
  await db.transaction(async (tx) => {
    await tx.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.userId, user.id), eq(apiTokens.kind, "calendar"), isNull(apiTokens.revokedAt)));
    await tx.insert(apiTokens).values({ userId: user.id, kind: "calendar", name: "Calendar feed", tokenHash: hash(secret), prefix: secret.slice(0, 14) });
  });
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "token.calendar", entityType: "profile", entityId: user.id });
  return { secret };
}

export async function revokeToken(user: CurrentUser, id: string): Promise<Result> {
  if (!z.guid().safeParse(id).success) return { ok: false, error: "That token no longer exists." };
  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id, name: apiTokens.name });
  if (!row) return { ok: false, error: "That token no longer exists." };
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "token.revoke", entityType: "api_token", entityId: id, before: { name: row.name } });
  return { ok: true };
}

/**
 * Who a secret belongs to, as a CurrentUser, or null. The profile is read
 * fresh, so a changed role applies at once and switched-off accounts are refused.
 */
export async function userForToken(secret: string, kind: Kind): Promise<CurrentUser | null> {
  if (!secret.startsWith(PREFIX[kind]) || secret.length > 100) return null;
  const [row] = await db
    .select({ token: apiTokens, profile: profiles })
    .from(apiTokens)
    .innerJoin(profiles, eq(profiles.id, apiTokens.userId))
    .where(and(eq(apiTokens.tokenHash, hash(secret)), eq(apiTokens.kind, kind), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row || row.profile.deactivatedAt) return null;
  if (row.token.expiresAt && row.token.expiresAt < new Date()) return null;
  // At most one write a minute per token.
  if (!row.token.lastUsedAt || Date.now() - row.token.lastUsedAt.getTime() > 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.token.id));
  }
  const p = row.profile;
  return { id: p.id, email: p.email, fullName: p.fullName, phone: p.phone, phoneRegion: p.phoneRegion, role: p.role, orgId: p.orgId };
}

/** "Authorization: Bearer modus_pat_…" → the token's owner, or null. */
export async function authenticateBearer(req: Request) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? userForToken(m[1], "api") : null;
}
