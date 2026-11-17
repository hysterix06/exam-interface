import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/db/client";
import { assignments, courseEvents, courses, exams, gradeCategories } from "@/db/schema";
import { courseInfoSchema, parseCourseInfo } from "@/engine/course";
import { canTeach, requireStaff, type Scope } from "@/server/access";
import type { CurrentUser } from "@/server/auth";
import { getCourse } from "@/server/authoring/data";
import { writeAudit } from "@/server/authoring/audit";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form and try again.";

/** The course behind every tab of the teacher's course workspace. 404 outside your courses. */
export const workspaceCourse = cache(async (id: string) => {
  const { user, scope } = await requireStaff();
  if (!z.guid().safeParse(id).success) notFound();
  const course = await getCourse(scope, id);
  if (!course) notFound();
  return { user, scope, course: { ...course, info: parseCourseInfo(course.info) } };
});

async function ownCourse(scope: Scope, courseId: string) {
  if (!z.guid().safeParse(courseId).success || !canTeach(scope, courseId)) return null;
  return getCourse(scope, courseId);
}

// Details: the homepage blurb, syllabus, dates and contact info.

const isoDate = z.union([z.iso.date(), z.literal("").transform(() => null), z.null()]);
const detailsSchema = z
  .object({
    description: z.string().max(5_000).transform((s) => s.trim() || null),
    syllabus: z.string().max(100_000).transform((s) => s.trim() || null),
    term: z.string().max(80).transform((s) => s.trim() || null),
    startsOn: isoDate,
    endsOn: isoDate,
    info: courseInfoSchema,
  })
  .refine((d) => !d.startsOn || !d.endsOn || d.startsOn <= d.endsOn, { message: "The course ends before it starts.", path: ["endsOn"] });
export type CourseDetailsInput = z.input<typeof detailsSchema>;

export async function saveCourseDetails(user: CurrentUser, scope: Scope, courseId: string, input: unknown): Promise<Result> {
  const course = await ownCourse(scope, courseId);
  if (!course) return fail("That course no longer exists.");
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const before = { description: course.description, syllabus: course.syllabus, term: course.term, startsOn: course.startsOn, endsOn: course.endsOn, info: course.info };
  await db.update(courses).set(parsed.data).where(eq(courses.id, courseId));
  await writeAudit({ orgId: scope.orgId, actorId: user.id, action: "course.details", entityType: "course", entityId: courseId, before, after: parsed.data });
  return { ok: true };
}

// Grade categories (weights).

export async function listCategories(courseId: string) {
  return db.select().from(gradeCategories).where(eq(gradeCategories.courseId, courseId)).orderBy(asc(gradeCategories.position), asc(gradeCategories.name));
}

const categoriesSchema = z
  .array(
    z.object({
      id: z.guid().optional(),
      name: z.string().trim().min(1, "Every category needs a name.").max(60),
      weight: z.number().min(0, "Weights can't be negative.").max(100, "A weight can't be over 100%."),
      dropLowest: z.number().int().min(0).max(20).default(0),
    }),
  )
  .max(20)
  .refine((rows) => new Set(rows.map((r) => r.name.toLowerCase())).size === rows.length, { message: "Two categories have the same name." });

/** Replaces the course's categories. Items in a removed category become uncounted (the foreign key sets null). */
export async function saveCategories(user: CurrentUser, scope: Scope, courseId: string, input: unknown): Promise<Result> {
  const course = await ownCourse(scope, courseId);
  if (!course) return fail("That course no longer exists.");
  const parsed = categoriesSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const before = await listCategories(courseId);
  const keep = new Set(parsed.data.flatMap((r) => (r.id ? [r.id] : [])));
  if ([...keep].some((id) => !before.some((b) => b.id === id))) return fail("Reload the page: the categories changed.");
  await db.transaction(async (tx) => {
    const gone = before.filter((b) => !keep.has(b.id)).map((b) => b.id);
    if (gone.length) await tx.delete(gradeCategories).where(inArray(gradeCategories.id, gone));
    for (const [position, r] of parsed.data.entries()) {
      if (r.id) await tx.update(gradeCategories).set({ name: r.name, weight: r.weight, dropLowest: r.dropLowest, position }).where(eq(gradeCategories.id, r.id));
      else await tx.insert(gradeCategories).values({ courseId, name: r.name, weight: r.weight, dropLowest: r.dropLowest, position });
    }
    await writeAudit({ orgId: scope.orgId, actorId: user.id, action: "course.weights", entityType: "course", entityId: courseId, before, after: parsed.data }, tx);
  });
  return { ok: true };
}

/** Puts one exam or assignment into a category of its own course (or none). */
export async function setItemCategory(
  user: CurrentUser,
  scope: Scope,
  input: { kind: "exam" | "assignment"; id: string; categoryId: string | null },
): Promise<Result> {
  if (!z.guid().safeParse(input.id).success || (input.categoryId !== null && !z.guid().safeParse(input.categoryId).success)) return fail("That item no longer exists.");
  const table = input.kind === "exam" ? exams : assignments;
  const [item] = await db.select({ courseId: table.courseId, categoryId: table.categoryId }).from(table).where(eq(table.id, input.id)).limit(1);
  if (!item || !canTeach(scope, item.courseId)) return fail("That item no longer exists.");
  if (input.categoryId) {
    const [cat] = await db.select({ courseId: gradeCategories.courseId }).from(gradeCategories).where(eq(gradeCategories.id, input.categoryId)).limit(1);
    if (cat?.courseId !== item.courseId) return fail("That category belongs to another course.");
  }
  await db.update(table).set({ categoryId: input.categoryId }).where(eq(table.id, input.id));
  await writeAudit({ orgId: scope.orgId, actorId: user.id, action: `${input.kind}.category`, entityType: input.kind, entityId: input.id, before: { categoryId: item.categoryId }, after: { categoryId: input.categoryId } });
  return { ok: true };
}

/** Every exam and assignment in the course with its category, for the Grading tab. */
export async function listGradedItems(courseId: string) {
  const [e, a] = await Promise.all([
    db.select({ id: exams.id, title: exams.title, state: exams.state, categoryId: exams.categoryId }).from(exams).where(eq(exams.courseId, courseId)).orderBy(asc(exams.title)),
    db.select({ id: assignments.id, title: assignments.title, state: assignments.state, categoryId: assignments.categoryId }).from(assignments).where(eq(assignments.courseId, courseId)).orderBy(asc(assignments.title)),
  ]);
  return [...e.map((x) => ({ ...x, kind: "exam" as const })), ...a.map((x) => ({ ...x, kind: "assignment" as const }))];
}

// Calendar events.

export async function listEvents(courseId: string) {
  return db.select().from(courseEvents).where(eq(courseEvents.courseId, courseId)).orderBy(asc(courseEvents.startsAt));
}

const eventFields = {
  title: z.string().trim().min(1, "Give the event a title.").max(200),
  kind: z.enum(["class", "deadline", "holiday", "other"]),
  allDay: z.boolean().default(false),
  location: z.string().trim().max(200).transform((s) => s || null).nullish(),
  description: z.string().trim().max(2_000).transform((s) => s || null).nullish(),
};
const when = z.object({ startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }).nullish() }).refine((w) => !w.endsAt || w.endsAt >= w.startsAt, {
  message: "The event ends before it starts.",
});
// The browser works out each occurrence in the teacher's own time zone and
// sends instants, so "10:00 every Monday" stays 10:00 across a clock change.
const eventSchema = z.object({ id: z.guid().optional(), ...eventFields, occurrences: z.array(when).min(1).max(200) });

export async function saveEvent(user: CurrentUser, scope: Scope, courseId: string, input: unknown): Promise<Result<{ count: number }>> {
  const course = await ownCourse(scope, courseId);
  if (!course) return fail("That course no longer exists.");
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { id, occurrences, ...fields } = parsed.data;
  const rows = occurrences.map((o) => ({ ...fields, courseId, startsAt: new Date(o.startsAt), endsAt: o.endsAt ? new Date(o.endsAt) : null, createdBy: user.id }));
  if (id) {
    if (rows.length !== 1) return fail("Edit one event at a time.");
    const [old] = await db.select().from(courseEvents).where(and(eq(courseEvents.id, id), eq(courseEvents.courseId, courseId))).limit(1);
    if (!old) return fail("That event no longer exists.");
    await db.update(courseEvents).set(rows[0]).where(eq(courseEvents.id, id));
  } else {
    await db.insert(courseEvents).values(rows);
  }
  await writeAudit({ orgId: scope.orgId, actorId: user.id, action: id ? "event.update" : "event.create", entityType: "course", entityId: courseId, after: { ...fields, occurrences: occurrences.length } });
  return { ok: true, count: rows.length };
}

export async function deleteEvent(user: CurrentUser, scope: Scope, courseId: string, eventId: string): Promise<Result> {
  if (!(await ownCourse(scope, courseId)) || !z.guid().safeParse(eventId).success) return fail("That event no longer exists.");
  const [old] = await db.delete(courseEvents).where(and(eq(courseEvents.id, eventId), eq(courseEvents.courseId, courseId))).returning();
  if (!old) return fail("That event no longer exists.");
  await writeAudit({ orgId: scope.orgId, actorId: user.id, action: "event.delete", entityType: "course", entityId: courseId, before: old });
  return { ok: true };
}

/** The course calendar as staff see it: every exam window and due date (drafts included, marked), plus events. */
export async function staffCourseCalendar(course: { id: string; code: string | null; title: string }): Promise<import("@/engine/calendar").CalendarItem[]> {
  const label = course.code ? `${course.code} · ${course.title}` : course.title;
  const [e, a, ev] = await Promise.all([
    db.select({ id: exams.id, title: exams.title, state: exams.state, opensAt: exams.opensAt, closesAt: exams.closesAt }).from(exams).where(eq(exams.courseId, course.id)),
    db.select({ id: assignments.id, title: assignments.title, state: assignments.state, dueAt: assignments.dueAt }).from(assignments).where(eq(assignments.courseId, course.id)),
    listEvents(course.id),
  ]);
  const draft = (s: string) => (s === "draft" ? "Draft" : undefined);
  return [
    ...e.flatMap((x) => [
      ...(x.opensAt ? [{ id: `exam-opens:${x.id}`, kind: "exam-opens" as const, title: x.title, courseId: course.id, courseLabel: label, startsAt: x.opensAt.toISOString(), href: `/teach/exams/${x.id}`, status: draft(x.state) }] : []),
      ...(x.closesAt ? [{ id: `exam-closes:${x.id}`, kind: "exam-closes" as const, title: x.title, courseId: course.id, courseLabel: label, startsAt: x.closesAt.toISOString(), href: `/teach/exams/${x.id}`, status: draft(x.state) }] : []),
    ]),
    ...a.flatMap((x) => (x.dueAt ? [{ id: `due:${x.id}`, kind: "assignment-due" as const, title: x.title, courseId: course.id, courseLabel: label, startsAt: x.dueAt.toISOString(), href: `/teach/assignments/${x.id}`, status: draft(x.state) }] : [])),
    ...ev.map((x) => ({
      id: `event:${x.id}`,
      kind: "event" as const,
      eventKind: x.kind,
      title: x.title,
      courseId: course.id,
      courseLabel: label,
      startsAt: x.startsAt.toISOString(),
      endsAt: x.endsAt?.toISOString() ?? null,
      allDay: x.allDay,
      location: x.location,
      description: x.description,
    })),
  ];
}
