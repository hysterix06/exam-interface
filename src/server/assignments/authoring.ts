import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/db/client";
import { assignmentExtensions, assignments, courses, enrollments, gradeCategories, profiles, submissionGrades, submissions } from "@/db/schema";
import { validateAssignment } from "@/engine/assignments/preflight";
import { assignmentSettingsSchema, parseAssignmentSettings } from "@/engine/assignments/settings";
import { assignmentState } from "@/engine/assignments/state";
import type { RubricCriterion } from "@/engine/grading/rubric";
import { canTeach, inScope, requireStaff, type Scope } from "@/server/access";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const gone = fail("That assignment no longer exists.");

/** One assignment in your courses, or null. */
export async function getAssignment(scope: Scope, id: string) {
  if (!z.guid().safeParse(id).success) return null;
  const [row] = await db
    .select({ a: assignments, course: { id: courses.id, code: courses.code, title: courses.title } })
    .from(assignments)
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .where(and(eq(assignments.id, id), eq(assignments.orgId, scope.orgId), inScope(assignments.courseId, scope)))
    .limit(1);
  if (!row) return null;
  return { ...row.a, settings: parseAssignmentSettings(row.a.settings), rubric: (row.a.rubric as RubricCriterion[]) ?? [], course: row.course };
}
export type StaffAssignment = NonNullable<Awaited<ReturnType<typeof getAssignment>>>;

/** The assignment behind every tab of its workspace; 404 outside your courses. */
export const workspaceAssignment = cache(async (id: string) => {
  const { user, scope } = await requireStaff();
  const a = await getAssignment(scope, id);
  if (!a) notFound();
  const categories = await db.select({ id: gradeCategories.id, name: gradeCategories.name }).from(gradeCategories).where(eq(gradeCategories.courseId, a.courseId)).orderBy(asc(gradeCategories.position));
  return { user, scope, assignment: a, categories };
});

/** A course's assignments with hand-in and marking counts. */
export async function listCourseAssignments(scope: Scope, courseId: string) {
  const rows = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.courseId, courseId), eq(assignments.orgId, scope.orgId), inScope(assignments.courseId, scope)))
    .orderBy(asc(assignments.dueAt), asc(assignments.title));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  // Latest version per student, and whether it has a grade.
  const latest = db
    .selectDistinctOn([submissions.assignmentId, submissions.userId], { id: submissions.id, assignmentId: submissions.assignmentId })
    .from(submissions)
    .where(inArray(submissions.assignmentId, ids))
    .orderBy(submissions.assignmentId, submissions.userId, desc(submissions.version))
    .as("latest");
  const counts = await db
    .select({ assignmentId: latest.assignmentId, handedIn: count(), graded: count(submissionGrades.id) })
    .from(latest)
    .leftJoin(submissionGrades, eq(submissionGrades.submissionId, latest.id))
    .groupBy(latest.assignmentId);
  const now = new Date();
  return rows.map((a) => {
    const c = counts.find((x) => x.assignmentId === a.id);
    const settings = parseAssignmentSettings(a.settings);
    return {
      ...a,
      effective: assignmentState({ state: a.state, opensAt: a.opensAt, dueAt: a.dueAt, late: settings.late }, now),
      handedIn: c?.handedIn ?? 0,
      graded: c?.graded ?? 0,
      released: !!a.releasedAt && a.releasedAt <= now,
    };
  });
}

export async function createAssignment(user: CurrentUser, scope: Scope, input: { courseId: string; title: string }): Promise<Result<{ id: string }>> {
  if (!z.guid().safeParse(input.courseId).success || !canTeach(scope, input.courseId)) return fail("Choose one of your courses.");
  const title = input.title.trim().slice(0, 200);
  if (!title) return fail("Give the assignment a title.");
  const [course] = await db.select({ orgId: courses.orgId }).from(courses).where(and(eq(courses.id, input.courseId), eq(courses.orgId, scope.orgId))).limit(1);
  if (!course) return fail("Choose one of your courses.");
  const [row] = await db
    .insert(assignments)
    .values({ orgId: course.orgId, courseId: input.courseId, title, settings: assignmentSettingsSchema.parse({}), createdBy: user.id })
    .returning({ id: assignments.id });
  await writeAudit({ orgId: scope.orgId, actorId: user.id, action: "assignment.create", entityType: "assignment", entityId: row.id, after: { title } });
  return { ok: true, id: row.id };
}

const rubricSchema = z
  .array(z.object({ id: z.string().min(1).max(40), text: z.string().max(500), points: z.number().min(0).max(1000) }))
  .max(30);
const dateTime = z.union([z.iso.datetime({ offset: true }).transform((s) => new Date(s)), z.null()]);
const saveSchema = z.object({
  id: z.guid(),
  title: z.string().trim().min(1, "Give the assignment a title.").max(200),
  instructions: z.string().max(100_000).transform((s) => s.trim() || null),
  opensAt: dateTime,
  dueAt: dateTime,
  points: z.number().positive("The assignment must be worth more than 0 points.").max(10_000),
  categoryId: z.guid().nullable(),
  settings: assignmentSettingsSchema,
  rubric: rubricSchema,
});
export type AssignmentInput = z.input<typeof saveSchema>;

export async function saveAssignment(user: CurrentUser, scope: Scope, input: unknown): Promise<Result> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const { id, ...fields } = parsed.data;
  const a = await getAssignment(scope, id);
  if (!a) return gone;
  if (fields.categoryId) {
    const [cat] = await db.select({ courseId: gradeCategories.courseId }).from(gradeCategories).where(eq(gradeCategories.id, fields.categoryId)).limit(1);
    if (cat?.courseId !== a.courseId) return fail("That category belongs to another course.");
  }
  await db.update(assignments).set(fields).where(eq(assignments.id, id));
  return { ok: true };
}

/** Pre-flight for an assignment, as data (the Edit tab shows it live). */
export async function assignmentIssues(a: StaffAssignment) {
  const cats = await db.select({ id: gradeCategories.id }).from(gradeCategories).where(eq(gradeCategories.courseId, a.courseId));
  return validateAssignment({ ...a, categoryIds: cats.map((c) => c.id) });
}

export async function publishAssignment(user: CurrentUser, scope: Scope, id: string): Promise<Result> {
  const a = await getAssignment(scope, id);
  if (!a) return gone;
  const blocking = (await assignmentIssues(a)).filter((i) => i.severity === "blocking");
  if (blocking.length) return fail(blocking[0].message);
  await db.update(assignments).set({ state: "published" }).where(eq(assignments.id, id));
  await writeAudit({ orgId: scope.orgId, actorId: user.id, action: "assignment.publish", entityType: "assignment", entityId: id });
  return { ok: true };
}

/** Back to draft, only while nobody has handed anything in. */
export async function unpublishAssignment(user: CurrentUser, scope: Scope, id: string): Promise<Result> {
  const a = await getAssignment(scope, id);
  if (!a) return gone;
  const [{ n }] = await db.select({ n: count() }).from(submissions).where(eq(submissions.assignmentId, id));
  if (n > 0) return fail("Students have already handed work in, so it can't go back to draft.");
  await db.update(assignments).set({ state: "draft" }).where(eq(assignments.id, id));
  await writeAudit({ orgId: scope.orgId, actorId: user.id, action: "assignment.unpublish", entityType: "assignment", entityId: id });
  return { ok: true };
}

export async function deleteAssignment(user: CurrentUser, scope: Scope, id: string): Promise<Result<{ courseId: string }>> {
  const a = await getAssignment(scope, id);
  if (!a) return gone;
  if (a.state !== "draft") return fail("Only drafts can be deleted.");
  await db.delete(assignments).where(eq(assignments.id, id));
  await writeAudit({ orgId: scope.orgId, actorId: user.id, action: "assignment.delete", entityType: "assignment", entityId: id, before: { title: a.title } });
  return { ok: true, courseId: a.courseId };
}

/** Students see their marks and feedback from now on (or not, when withdrawn). */
export async function setReleased(user: CurrentUser, scope: Scope, id: string, released: boolean): Promise<Result> {
  const a = await getAssignment(scope, id);
  if (!a) return gone;
  if (a.state !== "published") return fail("Publish the assignment first.");
  await db.update(assignments).set({ releasedAt: released ? new Date() : null }).where(eq(assignments.id, id));
  await writeAudit({ orgId: scope.orgId, actorId: user.id, action: released ? "assignment.release" : "assignment.withdraw", entityType: "assignment", entityId: id });
  return { ok: true };
}

// Hand-ins, as staff see them.

/** Every enrolled student with their latest hand-in, its grade and any extension. */
export async function listSubmissionsForStaff(a: StaffAssignment) {
  const now = new Date();
  const [students, latest, exts, versions] = await Promise.all([
    db
      .select({ id: profiles.id, name: profiles.fullName, email: profiles.email })
      .from(enrollments)
      .innerJoin(profiles, eq(profiles.id, enrollments.userId))
      .where(and(eq(enrollments.courseId, a.courseId), eq(enrollments.role, "student"), isNull(profiles.deactivatedAt)))
      .orderBy(asc(profiles.fullName), asc(profiles.email)),
    db
      .selectDistinctOn([submissions.userId], { sub: submissions, grade: submissionGrades })
      .from(submissions)
      .leftJoin(submissionGrades, eq(submissionGrades.submissionId, submissions.id))
      .where(eq(submissions.assignmentId, a.id))
      .orderBy(submissions.userId, desc(submissions.version)),
    db.select().from(assignmentExtensions).where(eq(assignmentExtensions.assignmentId, a.id)),
    db.select({ userId: submissions.userId, n: count() }).from(submissions).where(eq(submissions.assignmentId, a.id)).groupBy(submissions.userId),
  ]);
  return students.map((s) => {
    const l = latest.find((x) => x.sub.userId === s.id);
    const ext = exts.find((e) => e.userId === s.id) ?? null;
    const state = assignmentState({ state: a.state, opensAt: a.opensAt, dueAt: a.dueAt, late: a.settings.late }, now, ext?.dueAt);
    const status = l?.grade
      ? l.grade.excused
        ? "Excused"
        : "Marked"
      : l
        ? l.sub.lateMinutes > 0
          ? "Handed in late"
          : "Handed in"
        : state === "closed"
          ? "Missing"
          : state === "late"
            ? "Overdue"
            : "Not handed in";
    return {
      student: { id: s.id, name: s.name ?? s.email, email: s.email },
      submission: l?.sub ?? null,
      versions: versions.find((v) => v.userId === s.id)?.n ?? 0,
      grade: l?.grade ?? null,
      extension: ext,
      status,
    };
  });
}

export async function setExtension(
  user: CurrentUser,
  scope: Scope,
  input: { assignmentId: string; userId: string; dueAt: string | null; reason?: string },
): Promise<Result> {
  const a = await getAssignment(scope, input.assignmentId);
  if (!a || !z.guid().safeParse(input.userId).success) return gone;
  const [enrolled] = await db
    .select({ id: enrollments.userId })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, a.courseId), eq(enrollments.userId, input.userId), eq(enrollments.role, "student")))
    .limit(1);
  if (!enrolled) return fail("That student isn't in this course.");
  if (input.dueAt === null) {
    await db.delete(assignmentExtensions).where(and(eq(assignmentExtensions.assignmentId, a.id), eq(assignmentExtensions.userId, input.userId)));
  } else {
    const due = z.iso.datetime({ offset: true }).safeParse(input.dueAt);
    if (!due.success) return fail("Pick a new due date.");
    const values = { assignmentId: a.id, userId: input.userId, dueAt: new Date(due.data), reason: input.reason?.trim().slice(0, 500) || null, createdBy: user.id };
    await db
      .insert(assignmentExtensions)
      .values(values)
      .onConflictDoUpdate({ target: [assignmentExtensions.assignmentId, assignmentExtensions.userId], set: { dueAt: values.dueAt, reason: values.reason, createdBy: user.id } });
  }
  await writeAudit({
    orgId: scope.orgId,
    actorId: user.id,
    action: input.dueAt ? "assignment.extend" : "assignment.extend-remove",
    entityType: "assignment",
    entityId: a.id,
    after: { userId: input.userId, dueAt: input.dueAt },
    reason: input.reason,
  });
  return { ok: true };
}

/** Assignments with hand-ins waiting for a mark, for the marking queue and sidebar count. */
export async function listAssignmentsToMark(scope: Scope) {
  const latest = db
    .selectDistinctOn([submissions.assignmentId, submissions.userId], { id: submissions.id, assignmentId: submissions.assignmentId })
    .from(submissions)
    .orderBy(submissions.assignmentId, submissions.userId, desc(submissions.version))
    .as("latest");
  return db
    .select({ id: assignments.id, title: assignments.title, courseId: assignments.courseId, courseTitle: courses.title, pending: sql<number>`count(*)::int` })
    .from(latest)
    .innerJoin(assignments, eq(assignments.id, latest.assignmentId))
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .leftJoin(submissionGrades, eq(submissionGrades.submissionId, latest.id))
    .where(and(isNull(submissionGrades.id), eq(assignments.orgId, scope.orgId), inScope(assignments.courseId, scope), isNull(courses.archivedAt)))
    .groupBy(assignments.id, courses.title)
    .orderBy(asc(assignments.title));
}

/** Published assignments whose hand-ins are all marked but whose grades students can't see yet. */
export async function listAssignmentsToRelease(scope: Scope) {
  const latest = db
    .selectDistinctOn([submissions.assignmentId, submissions.userId], { id: submissions.id, assignmentId: submissions.assignmentId })
    .from(submissions)
    .orderBy(submissions.assignmentId, submissions.userId, desc(submissions.version))
    .as("latest");
  return db
    .select({ id: assignments.id, title: assignments.title, courseTitle: courses.title, handedIn: sql<number>`count(*)::int` })
    .from(latest)
    .innerJoin(assignments, eq(assignments.id, latest.assignmentId))
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .leftJoin(submissionGrades, eq(submissionGrades.submissionId, latest.id))
    .where(and(eq(assignments.state, "published"), isNull(assignments.releasedAt), eq(assignments.orgId, scope.orgId), inScope(assignments.courseId, scope), isNull(courses.archivedAt)))
    .groupBy(assignments.id, courses.title)
    .having(sql`count(${submissionGrades.id}) = count(*)`)
    .orderBy(asc(assignments.title));
}
