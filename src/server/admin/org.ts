import "server-only";
import { and, count, desc, eq, gte, ilike, isNull, lt, ne, or, sql } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { z } from "zod";
import { db } from "@/db/client";
import { attemptItems, attempts, auditLog, courses, exams, grades, orgs, profiles } from "@/db/schema";
import { examSettingsSchema } from "@/engine/exam";
import { effectiveState } from "@/engine/exam-state";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";
import type { ActionResult } from "@/server/authoring/questions";
import { listAllCourses } from "./courses";
import { roleCounts } from "./people";

/** Defaults new exams start from. Instructors can change them per exam. */
export const orgSettingsSchema = z.object({
  defaults: examSettingsSchema.pick({ timeLimitMinutes: true, attemptsAllowed: true, release: true }).default({
    timeLimitMinutes: null,
    attemptsAllowed: 1,
    release: "score",
  }),
});
export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export async function getOrg(orgId: string) {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
  const parsed = orgSettingsSchema.safeParse(org?.settings ?? {});
  return { name: org?.name ?? "Organisation", settings: parsed.success ? parsed.data : orgSettingsSchema.parse({}) };
}

const settingsInput = z.object({
  name: z.string().trim().min(1, "Give the organisation a name.").max(120),
  settings: orgSettingsSchema,
});

export async function saveOrg(user: CurrentUser, raw: unknown): Promise<ActionResult> {
  const parsed = settingsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const before = await getOrg(user.orgId);
  await db.update(orgs).set(parsed.data).where(eq(orgs.id, user.orgId));
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "org.update", entityType: "org", entityId: user.orgId, before, after: parsed.data });
  return { ok: true };
}

/** The admin home: what's in the system, and what isn't set up yet. */
export async function loadOverview(orgId: string) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [people, allCourses, liveExams, [{ week }], [{ unmarked }], neverSignedIn, recent] = await Promise.all([
    roleCounts(orgId),
    listAllCourses(orgId),
    db
      .select({ id: exams.id, title: exams.title, state: exams.state, opensAt: exams.opensAt, closesAt: exams.closesAt, courseTitle: courses.title })
      .from(exams)
      .innerJoin(courses, eq(courses.id, exams.courseId))
      .where(and(eq(exams.orgId, orgId), or(eq(exams.state, "open"), eq(exams.state, "scheduled")), isNull(courses.archivedAt))),
    db
      .select({ week: count() })
      .from(attempts)
      .where(and(eq(attempts.orgId, orgId), eq(attempts.isPreview, false), gte(attempts.startedAt, weekAgo))),
    db
      .select({ unmarked: count() })
      .from(grades)
      .innerJoin(attemptItems, eq(attemptItems.id, grades.attemptItemId))
      .innerJoin(attempts, eq(attempts.id, attemptItems.attemptId))
      .where(and(eq(attempts.orgId, orgId), eq(attempts.isPreview, false), eq(grades.needsReview, true))),
    db
      .select({ n: count() })
      .from(profiles)
      .leftJoin(authUsers, eq(authUsers.id, profiles.id))
      .where(and(eq(profiles.orgId, orgId), isNull(profiles.deactivatedAt), isNull(authUsers.lastSignInAt))),
    listActivity(orgId, { limit: 8 }),
  ]);
  const now = new Date();
  return {
    people,
    courses: allCourses,
    openNow: liveExams.filter((e) => effectiveState(e, now) === "open"),
    attemptsThisWeek: week,
    unmarked,
    setup: {
      noTeacher: allCourses.filter((c) => c.teachers.length === 0),
      noStudents: allCourses.filter((c) => c.students === 0),
      neverSignedIn: neverSignedIn[0]?.n ?? 0,
    },
    recent: recent.rows,
  };
}

export interface ActivityFilters {
  q?: string;
  entity?: string;
  /** Keyset cursor: show entries older than this id. */
  before?: number;
  limit?: number;
}

export async function listActivity(orgId: string, f: ActivityFilters = {}) {
  const limit = f.limit ?? 50;
  const q = f.q?.trim().replace(/[%_]/g, "\\$&");
  const rows = await db
    .select({
      id: auditLog.id,
      ts: auditLog.ts,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      before: auditLog.before,
      after: auditLog.after,
      reason: auditLog.reason,
      actor: profiles.fullName,
      actorEmail: profiles.email,
    })
    .from(auditLog)
    .leftJoin(profiles, eq(profiles.id, auditLog.actorId))
    .where(
      and(
        eq(auditLog.orgId, orgId),
        f.entity ? eq(auditLog.entityType, f.entity) : undefined,
        f.before ? lt(auditLog.id, f.before) : undefined,
        q ? or(ilike(profiles.fullName, `%${q}%`), ilike(profiles.email, `%${q}%`), ilike(auditLog.action, `%${q}%`)) : undefined,
      ),
    )
    .orderBy(desc(auditLog.id))
    .limit(limit + 1);
  return { rows: rows.slice(0, limit), next: rows.length > limit ? rows[limit - 1].id : null };
}

/** Entity types that appear in the log, for the filter. */
export async function activityEntities(orgId: string) {
  const rows = await db
    .selectDistinct({ entityType: auditLog.entityType })
    .from(auditLog)
    .where(and(eq(auditLog.orgId, orgId), ne(auditLog.entityType, "")));
  return rows.map((r) => r.entityType).sort();
}

/** A quick, honest health check for the settings page. */
export async function systemStatus() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return { database: true, latencyMs: Date.now() - started, accounts: !!process.env.SUPABASE_SECRET_KEY };
  } catch {
    return { database: false, latencyMs: null, accounts: !!process.env.SUPABASE_SECRET_KEY };
  }
}
