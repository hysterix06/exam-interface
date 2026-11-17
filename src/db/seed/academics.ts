// Course homepages, weights, calendar events and assignments for the demo
// courses (content in academics-content.ts). Keyed on BIO 101 having grade
// categories, so it also runs on an older database, and never twice.
import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { gradeSubmission } from "@/engine/assignments/grade";
import { parseAssignmentSettings } from "@/engine/assignments/settings";
import { createRng } from "@/engine/rng";
import * as schema from "../schema";
import type { DemoCourse } from "./academics-content";

type Db = PostgresJsDatabase<typeof schema>;
const DAY = 86_400_000;

/** Monday 00:00 UTC of the current week. */
function mondayOfThisWeek(now: Date) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY);
}
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function seedAcademics(db: Db, courseId: string, c: DemoCourse, teacherId: string) {
  const [existing] = await db.select({ id: schema.gradeCategories.id }).from(schema.gradeCategories).where(eq(schema.gradeCategories.courseId, courseId)).limit(1);
  if (existing) {
    console.log(`  academics  ${c.code} already set up, left untouched`);
    return;
  }
  const now = new Date();
  const monday = mondayOfThisWeek(now);
  const start = new Date(monday.getTime() - c.weeksBefore * 7 * DAY);
  const end = new Date(monday.getTime() + (c.weeksAfter * 7 - 3) * DAY);

  await db
    .update(schema.courses)
    .set({ description: c.description, syllabus: c.syllabus, term: c.term, startsOn: isoDate(start), endsOn: isoDate(end), info: c.info })
    .where(eq(schema.courses.id, courseId));

  const cats = await db
    .insert(schema.gradeCategories)
    .values(c.categories.map((x, position) => ({ courseId, ...x, position })))
    .returning({ id: schema.gradeCategories.id, name: schema.gradeCategories.name });
  const catId = (name: string) => cats.find((x) => x.name === name)!.id;

  for (const [title, cat] of Object.entries(c.examCategories)) {
    await db.update(schema.exams).set({ categoryId: catId(cat) }).where(and(eq(schema.exams.courseId, courseId), eq(schema.exams.title, title)));
  }
  // CHEM: any exam counts as an exam.
  if (Object.keys(c.examCategories).length === 0 && c.categories.some((x) => x.name === "Exams")) {
    await db.update(schema.exams).set({ categoryId: catId("Exams") }).where(eq(schema.exams.courseId, courseId));
  }

  // Weekly classes across the term, plus one-off events.
  const events: (typeof schema.courseEvents.$inferInsert)[] = [];
  for (let week = 0; start.getTime() + week * 7 * DAY <= end.getTime(); week++) {
    for (const k of c.classes) {
      const s = new Date(start.getTime() + (week * 7 + k.weekday) * DAY + k.hour * 3_600_000);
      events.push({ courseId, title: k.title, kind: "class", startsAt: s, endsAt: new Date(s.getTime() + k.minutes * 60_000), location: k.location, createdBy: teacherId });
    }
  }
  for (const e of c.events) {
    const s = new Date(monday.getTime() + e.day * DAY);
    events.push({ courseId, title: e.title, kind: e.kind, startsAt: e.kind === "holiday" ? s : new Date(s.getTime() + 13 * 3_600_000), allDay: e.kind === "holiday", description: e.description ?? null, createdBy: teacherId });
  }
  await db.insert(schema.courseEvents).values(events);

  const students = await db
    .select({ id: schema.enrollments.userId, email: schema.profiles.email })
    .from(schema.enrollments)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.enrollments.userId))
    .where(and(eq(schema.enrollments.courseId, courseId), eq(schema.enrollments.role, "student")))
    .orderBy(asc(schema.profiles.email));

  let handIns = 0;
  for (const a of c.assignments) {
    const settings = parseAssignmentSettings(a.settings);
    const dueAt = new Date(now.getTime() + a.dueInDays * DAY);
    dueAt.setUTCHours(17, 0, 0, 0);
    const [row] = await db
      .insert(schema.assignments)
      .values({
        courseId,
        categoryId: catId(a.category),
        title: a.title,
        instructions: a.instructions,
        state: "published",
        opensAt: new Date(now.getTime() + a.opensInDays * DAY),
        dueAt,
        points: a.points,
        settings,
        rubric: a.rubric,
        releasedAt: a.demo === "released" ? new Date(dueAt.getTime() + 3 * DAY) : null,
        createdBy: teacherId,
      })
      .returning({ id: schema.assignments.id });
    if (a.demo === "open") continue;

    // Most students hand in; a few are late; one or two never do.
    const rng = createRng(`academics:${a.title}`);
    for (const [i, s] of students.entries()) {
      const roll = rng.next();
      if (roll < 0.08 && s.email !== "student@example.com") continue;
      const late = roll > 0.85 ? Math.round(rng.next() * 2 * 24 * 60) + 30 : 0;
      const submittedAt = new Date(dueAt.getTime() + (late ? late * 60_000 : -Math.round(rng.next() * 3 * DAY)));
      const [sub] = await db
        .insert(schema.submissions)
        .values({ assignmentId: row.id, userId: s.id, version: 1, text: a.answers[i % a.answers.length], files: [], submittedAt, lateMinutes: late })
        .returning({ id: schema.submissions.id });
      handIns++;
      if (a.demo !== "released") continue;
      const ticked = a.rubric.filter(() => rng.next() < 0.75).map((r) => r.id);
      const g = gradeSubmission({ rubric: a.rubric, points: a.points, ticked, lateMinutes: late, late: settings.late });
      await db.insert(schema.submissionGrades).values({
        submissionId: sub.id,
        score: g.score,
        max: g.max,
        lines: g.lines,
        ticked,
        latePenalty: g.latePenalty,
        feedback: ticked.length === a.rubric.length ? "Excellent: complete and accurate." : "Good work. Check the rubric lines you missed before the next one.",
        graderId: teacherId,
        gradedAt: new Date(dueAt.getTime() + 2 * DAY),
      });
    }
  }
  console.log(`  academics  ${c.code}: homepage, ${cats.length} grade categories, ${events.length} events, ${c.assignments.length} assignments, ${handIns} hand-ins`);
}

