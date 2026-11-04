import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { courses, enrollments, exams, profiles } from "@/db/schema";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";
import type { ActionResult } from "@/server/authoring/questions";

/** Every course in the org with who teaches it and how many students it has. */
export async function listAllCourses(orgId: string, includeArchived = false) {
  const rows = await db
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      archivedAt: courses.archivedAt,
      students: sql<number>`count(${enrollments.userId}) filter (where ${enrollments.role} = 'student')::int`,
    })
    .from(courses)
    .leftJoin(enrollments, eq(enrollments.courseId, courses.id))
    .where(and(eq(courses.orgId, orgId), includeArchived ? undefined : isNull(courses.archivedAt)))
    .groupBy(courses.id)
    .orderBy(asc(courses.title));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [teachers, examCounts] = await Promise.all([
    db
      .select({ courseId: enrollments.courseId, name: profiles.fullName, email: profiles.email })
      .from(enrollments)
      .innerJoin(profiles, eq(profiles.id, enrollments.userId))
      .where(and(inArray(enrollments.courseId, ids), eq(enrollments.role, "teacher"))),
    db
      .select({ courseId: exams.courseId, n: sql<number>`count(*)::int` })
      .from(exams)
      .where(inArray(exams.courseId, ids))
      .groupBy(exams.courseId),
  ]);
  return rows.map((r) => ({
    ...r,
    teachers: teachers.filter((t) => t.courseId === r.id).map((t) => t.name ?? t.email),
    exams: examCounts.find((e) => e.courseId === r.id)?.n ?? 0,
  }));
}

export async function getCourseWithMembers(orgId: string, id: string) {
  if (!z.guid().safeParse(id).success) return null;
  const [course] = await db.select().from(courses).where(and(eq(courses.id, id), eq(courses.orgId, orgId))).limit(1);
  if (!course) return null;
  const members = await db
    .select({
      userId: profiles.id,
      name: profiles.fullName,
      email: profiles.email,
      role: enrollments.role,
      accountRole: profiles.role,
      deactivatedAt: profiles.deactivatedAt,
      since: enrollments.createdAt,
    })
    .from(enrollments)
    .innerJoin(profiles, eq(profiles.id, enrollments.userId))
    .where(eq(enrollments.courseId, id))
    .orderBy(asc(enrollments.role), asc(sql`coalesce(${profiles.fullName}, ${profiles.email})`));
  return { course, members };
}

const courseInput = z.object({
  code: z.string().trim().max(30).transform((c) => c || null),
  title: z.string().trim().min(1, "Give the course a title.").max(200),
});

export async function createCourse(user: CurrentUser, raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = courseInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const [row] = await db
    .insert(courses)
    .values({ orgId: user.orgId, ...parsed.data })
    .returning({ id: courses.id });
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "course.create", entityType: "course", entityId: row.id, after: parsed.data });
  return { ok: true, id: row.id };
}

export async function updateCourse(user: CurrentUser, id: string, raw: unknown): Promise<ActionResult> {
  const parsed = courseInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const found = await getCourseWithMembers(user.orgId, id);
  if (!found) return { ok: false, error: "That course no longer exists." };
  await db.update(courses).set(parsed.data).where(eq(courses.id, id));
  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    action: "course.update",
    entityType: "course",
    entityId: id,
    before: { code: found.course.code, title: found.course.title },
    after: parsed.data,
  });
  return { ok: true };
}

/** Archived courses disappear from everyone's lists; nothing is deleted. */
export async function setArchived(user: CurrentUser, id: string, archived: boolean): Promise<ActionResult> {
  const found = await getCourseWithMembers(user.orgId, id);
  if (!found) return { ok: false, error: "That course no longer exists." };
  await db.update(courses).set({ archivedAt: archived ? new Date() : null }).where(eq(courses.id, id));
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: archived ? "course.archive" : "course.restore", entityType: "course", entityId: id });
  return { ok: true };
}

/**
 * Add existing people to a course by email. Teachers must have a staff
 * account; anyone can be a student. Unknown emails are reported back so the
 * admin can create those accounts.
 */
export async function addMembers(
  user: CurrentUser,
  input: { courseId: string; emails: string[]; role: "teacher" | "student" },
): Promise<ActionResult<{ added: number; missing: string[]; skipped: string[] }>> {
  const found = await getCourseWithMembers(user.orgId, input.courseId);
  if (!found) return { ok: false, error: "That course no longer exists." };
  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (emails.length === 0) return { ok: false, error: "Enter at least one email." };
  if (emails.length > 500) return { ok: false, error: "Add at most 500 people at a time." };

  const people = await db
    .select({ id: profiles.id, email: profiles.email, role: profiles.role })
    .from(profiles)
    .where(and(eq(profiles.orgId, user.orgId), inArray(sql`lower(${profiles.email})`, emails)));
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p]));
  const missing = emails.filter((e) => !byEmail.has(e));
  const eligible = people.filter((p) => input.role === "student" || p.role !== "student");
  const skipped = people.filter((p) => !eligible.includes(p)).map((p) => p.email);

  if (eligible.length > 0) {
    await db
      .insert(enrollments)
      .values(eligible.map((p) => ({ courseId: input.courseId, userId: p.id, role: input.role })))
      .onConflictDoUpdate({ target: [enrollments.courseId, enrollments.userId], set: { role: input.role } });
    await writeAudit({
      orgId: user.orgId,
      actorId: user.id,
      action: input.role === "teacher" ? "course.assign_teacher" : "course.enrol",
      entityType: "course",
      entityId: input.courseId,
      after: { people: eligible.map((p) => p.email) },
    });
  }
  return { ok: true, added: eligible.length, missing, skipped };
}

export async function removeMember(user: CurrentUser, input: { courseId: string; userId: string }): Promise<ActionResult> {
  const found = await getCourseWithMembers(user.orgId, input.courseId);
  const member = found?.members.find((m) => m.userId === input.userId);
  if (!found || !member) return { ok: false, error: "That person isn't in this course." };
  await db.delete(enrollments).where(and(eq(enrollments.courseId, input.courseId), eq(enrollments.userId, input.userId)));
  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    action: "course.remove_member",
    entityType: "course",
    entityId: input.courseId,
    before: { email: member.email, role: member.role },
  });
  return { ok: true };
}
