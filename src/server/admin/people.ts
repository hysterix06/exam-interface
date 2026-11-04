import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { z } from "zod";
import { db } from "@/db/client";
import { courses, enrollments, profiles } from "@/db/schema";
import { ROLES, type Role } from "@/lib/auth/roles";
import type { RosterRow } from "@/lib/roster";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";
import type { ActionResult } from "@/server/authoring/questions";

// Same reading-friendly alphabet as exam codes: no 0/O/1/I/l.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** A one-time password the admin hands over; the person changes it in Account. */
function tempPassword() {
  return Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export interface PeopleFilters {
  q?: string;
  role?: Role;
  status?: "active" | "inactive" | "never";
}

export async function listPeople(orgId: string, f: PeopleFilters = {}) {
  const q = f.q?.trim().replace(/[%_]/g, "\\$&");
  const rows = await db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      email: profiles.email,
      role: profiles.role,
      deactivatedAt: profiles.deactivatedAt,
      createdAt: profiles.createdAt,
      lastSignInAt: authUsers.lastSignInAt,
    })
    .from(profiles)
    .leftJoin(authUsers, eq(authUsers.id, profiles.id))
    .where(
      and(
        eq(profiles.orgId, orgId),
        q ? or(ilike(profiles.fullName, `%${q}%`), ilike(profiles.email, `%${q}%`)) : undefined,
        f.role ? eq(profiles.role, f.role) : undefined,
        f.status === "inactive" ? isNotNull(profiles.deactivatedAt) : undefined,
        f.status === "active" ? isNull(profiles.deactivatedAt) : undefined,
        f.status === "never" ? and(isNull(authUsers.lastSignInAt), isNull(profiles.deactivatedAt)) : undefined,
      ),
    )
    .orderBy(asc(profiles.role), asc(sql`coalesce(${profiles.fullName}, ${profiles.email})`))
    .limit(1000);

  const memberships = rows.length
    ? await db
        .select({ userId: enrollments.userId, role: enrollments.role, code: courses.code, title: courses.title })
        .from(enrollments)
        .innerJoin(courses, eq(courses.id, enrollments.courseId))
        .where(and(inArray(enrollments.userId, rows.map((r) => r.id)), isNull(courses.archivedAt)))
    : [];
  return rows.map((r) => ({
    ...r,
    lastSignInAt: r.lastSignInAt ? new Date(r.lastSignInAt) : null,
    courses: memberships.filter((m) => m.userId === r.id).map((m) => ({ label: m.code ?? m.title, role: m.role })),
  }));
}

export async function roleCounts(orgId: string) {
  const rows = await db
    .select({ role: profiles.role, n: count() })
    .from(profiles)
    .where(and(eq(profiles.orgId, orgId), isNull(profiles.deactivatedAt)))
    .groupBy(profiles.role);
  return Object.fromEntries(ROLES.map((r) => [r, rows.find((x) => x.role === r)?.n ?? 0])) as Record<Role, number>;
}

const personInput = z.object({
  fullName: z.string().trim().min(1, "Enter their name.").max(120),
  email: z.email("That email address isn't valid.").transform((e) => e.toLowerCase()),
  role: z.enum(ROLES),
  courseId: z.guid().nullable(),
});

async function enrolFor(executor: Pick<typeof db, "insert">, userId: string, role: Role, courseId: string) {
  await executor
    .insert(enrollments)
    .values({ courseId, userId, role: role === "student" ? "student" : "teacher" })
    .onConflictDoNothing();
}

async function createAccount(user: CurrentUser, p: { fullName: string | null; email: string; role: Role }) {
  const password = tempPassword();
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email: p.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: p.fullName },
  });
  if (error || !data.user) return { error: error?.message ?? "The account couldn't be created." };
  // The on_auth_user_created trigger made the profile as a student; set the role.
  await db
    .update(profiles)
    .set({ role: p.role, fullName: p.fullName, orgId: user.orgId })
    .where(eq(profiles.id, data.user.id));
  return { id: data.user.id, password };
}

/** Add one person. Returns their one-time password; it is never stored or shown again. */
export async function addPerson(user: CurrentUser, raw: unknown): Promise<ActionResult<{ id: string; password: string }>> {
  const parsed = personInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const p = parsed.data;

  const [existing] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, p.email)).limit(1);
  if (existing) return { ok: false, error: "Someone with that email already has an account." };
  if (p.courseId && !(await courseInOrg(user.orgId, p.courseId))) return { ok: false, error: "That course no longer exists." };

  const made = await createAccount(user, p);
  if ("error" in made) return { ok: false, error: made.error! };
  if (p.courseId) await enrolFor(db, made.id, p.role, p.courseId);
  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    action: "person.add",
    entityType: "person",
    entityId: made.id,
    after: { email: p.email, role: p.role, courseId: p.courseId },
  });
  return { ok: true, id: made.id, password: made.password };
}

export interface ImportOutcome {
  email: string;
  fullName: string | null;
  status: "created" | "enrolled" | "exists" | "failed";
  password?: string;
  error?: string;
}

/**
 * Import a parsed roster. New emails get an account (with a one-time password);
 * existing ones are only enrolled. Nobody's role is changed by an import.
 */
export async function importPeople(
  user: CurrentUser,
  input: { rows: RosterRow[]; defaultRole: Role; courseId: string | null },
): Promise<ActionResult<{ outcomes: ImportOutcome[] }>> {
  if (input.rows.length === 0) return { ok: false, error: "There's nobody to add." };
  if (input.rows.length > 500) return { ok: false, error: "Add at most 500 people at a time." };
  if (!ROLES.includes(input.defaultRole)) return { ok: false, error: "Choose a role." };
  if (input.courseId && !(await courseInOrg(user.orgId, input.courseId))) return { ok: false, error: "That course no longer exists." };

  const emails = input.rows.map((r) => r.email.toLowerCase());
  const known = await db
    .select({ id: profiles.id, email: profiles.email, role: profiles.role, orgId: profiles.orgId })
    .from(profiles)
    .where(inArray(profiles.email, emails));
  const byEmail = new Map(known.map((k) => [k.email.toLowerCase(), k]));

  const outcomes: ImportOutcome[] = [];
  for (const r of input.rows) {
    const email = r.email.toLowerCase();
    const found = byEmail.get(email);
    if (found) {
      if (found.orgId !== user.orgId) {
        outcomes.push({ email, fullName: r.fullName, status: "failed", error: "Belongs to another organisation" });
      } else if (input.courseId) {
        await enrolFor(db, found.id, found.role, input.courseId);
        outcomes.push({ email, fullName: r.fullName, status: "enrolled" });
      } else {
        outcomes.push({ email, fullName: r.fullName, status: "exists" });
      }
      continue;
    }
    const role = r.role ?? input.defaultRole;
    const made = await createAccount(user, { fullName: r.fullName, email, role });
    if ("error" in made) {
      outcomes.push({ email, fullName: r.fullName, status: "failed", error: made.error });
      continue;
    }
    if (input.courseId) await enrolFor(db, made.id, role, input.courseId);
    outcomes.push({ email, fullName: r.fullName, status: "created", password: made.password });
  }

  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    action: "person.import",
    entityType: "org",
    entityId: user.orgId,
    after: {
      created: outcomes.filter((o) => o.status === "created").length,
      enrolled: outcomes.filter((o) => o.status === "enrolled").length,
      failed: outcomes.filter((o) => o.status === "failed").length,
      courseId: input.courseId,
    },
  });
  return { ok: true, outcomes };
}

async function courseInOrg(orgId: string, courseId: string) {
  const [c] = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, courseId), eq(courses.orgId, orgId))).limit(1);
  return !!c;
}

async function personInOrg(orgId: string, id: string) {
  if (!z.guid().safeParse(id).success) return null;
  const [p] = await db.select().from(profiles).where(and(eq(profiles.id, id), eq(profiles.orgId, orgId))).limit(1);
  return p ?? null;
}

/** At least one active admin must remain, or nobody can manage the organisation. */
async function otherActiveAdmins(orgId: string, exceptId: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(profiles)
    .where(and(eq(profiles.orgId, orgId), eq(profiles.role, "admin"), isNull(profiles.deactivatedAt), ne(profiles.id, exceptId)));
  return n;
}

export async function setRole(user: CurrentUser, input: { id: string; role: Role }): Promise<ActionResult> {
  if (!ROLES.includes(input.role)) return { ok: false, error: "Choose a role." };
  const person = await personInOrg(user.orgId, input.id);
  if (!person) return { ok: false, error: "That person no longer exists." };
  if (person.role === input.role) return { ok: true };
  if (person.role === "admin" && (await otherActiveAdmins(user.orgId, person.id)) === 0) {
    return { ok: false, error: "This is the last administrator. Make someone else an administrator first." };
  }
  await db.transaction(async (tx) => {
    await tx.update(profiles).set({ role: input.role }).where(eq(profiles.id, person.id));
    // Course roles follow: a student can't stay a course's teacher, and vice versa.
    await tx
      .update(enrollments)
      .set({ role: input.role === "student" ? "student" : "teacher" })
      .where(eq(enrollments.userId, person.id));
    await writeAudit(
      { orgId: user.orgId, actorId: user.id, action: "person.role", entityType: "person", entityId: person.id, before: { role: person.role }, after: { role: input.role } },
      tx,
    );
  });
  return { ok: true };
}

/** Switch an account off or on. History stays; a switched-off person can't sign in. */
export async function setActive(user: CurrentUser, input: { id: string; active: boolean }): Promise<ActionResult> {
  const person = await personInOrg(user.orgId, input.id);
  if (!person) return { ok: false, error: "That person no longer exists." };
  if (person.id === user.id) return { ok: false, error: "You can't switch off your own account." };
  if (!input.active && person.role === "admin" && (await otherActiveAdmins(user.orgId, person.id)) === 0) {
    return { ok: false, error: "This is the last administrator." };
  }
  // A ban also revokes their refresh token, so they're signed out within the hour.
  const { error } = await createAdminClient().auth.admin.updateUserById(person.id, {
    ban_duration: input.active ? "none" : "876000h",
  });
  if (error) return { ok: false, error: error.message };
  await db.update(profiles).set({ deactivatedAt: input.active ? null : new Date() }).where(eq(profiles.id, person.id));
  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    action: input.active ? "person.reactivate" : "person.deactivate",
    entityType: "person",
    entityId: person.id,
  });
  return { ok: true };
}

export async function resetPassword(user: CurrentUser, id: string): Promise<ActionResult<{ password: string }>> {
  const person = await personInOrg(user.orgId, id);
  if (!person) return { ok: false, error: "That person no longer exists." };
  const password = tempPassword();
  const { error } = await createAdminClient().auth.admin.updateUserById(person.id, { password });
  if (error) return { ok: false, error: error.message };
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "person.password", entityType: "person", entityId: person.id });
  return { ok: true, password };
}
