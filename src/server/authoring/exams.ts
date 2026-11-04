import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { attempts, courses, exams, topics } from "@/db/schema";
import { finalizeMany } from "@/server/attempts/take";
import { canTeach, scopeFor } from "@/server/access";
import { getOrg } from "@/server/admin/org";
import { preflightExam, type PreflightReport } from "@/engine/authoring/preflight";
import { canTransition, type ExamStateName } from "@/engine/exam-state";
import { examSettingsSchema } from "@/engine/exam";
import { blueprintSchema } from "@/engine/selection/types";
import { questionLabel } from "@/lib/question-label";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "./audit";
import { getExam, loadPool, topicNames } from "./data";
import type { ActionResult } from "./questions";

export const examInputSchema = z.object({
  id: z.guid(),
  title: z.string().trim().min(1, "Give the exam a title.").max(200),
  description: z.string().trim().max(2000).nullable(),
  blueprint: blueprintSchema,
  settings: examSettingsSchema,
});

export async function createExam(
  user: CurrentUser,
  input: { courseId: string; title: string },
): Promise<ActionResult<{ id: string }>> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the exam a title." };
  const scope = await scopeFor(user);
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, input.courseId), eq(courses.orgId, user.orgId), isNull(courses.archivedAt)))
    .limit(1);
  if (!course || !canTeach(scope, course.id)) return { ok: false, error: "Choose one of your courses." };

  const [row] = await db
    .insert(exams)
    .values({
      orgId: user.orgId,
      courseId: course.id,
      title,
      blueprint: { sections: [], shuffleQuestions: true },
      settings: examSettingsSchema.parse((await getOrg(user.orgId)).settings.defaults),
      createdBy: user.id,
    })
    .returning({ id: exams.id });
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "exam.create", entityType: "exam", entityId: row.id, after: { title } });
  return { ok: true, id: row.id };
}

async function courseTopicIds(courseId: string) {
  const rows = await db.select({ id: topics.id }).from(topics).where(eq(topics.courseId, courseId));
  return new Set(rows.map((r) => r.id));
}

/** Change state only if it is still `from`; a concurrent change makes this a no-op. */
async function moveState(examId: string, from: ExamStateName, set: Partial<typeof exams.$inferInsert>) {
  const rows = await db
    .update(exams)
    .set(set)
    .where(and(eq(exams.id, examId), eq(exams.state, from)))
    .returning({ id: exams.id });
  return rows.length > 0;
}

const CHANGED = "Someone else just changed this exam. Reload to see the latest.";

export async function saveExam(user: CurrentUser, raw: unknown): Promise<ActionResult> {
  const parsed = examInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Some fields are invalid." };
  }
  const input = parsed.data;

  const exam = await getExam(await scopeFor(user), input.id);
  if (!exam) return { ok: false, error: "That exam no longer exists." };
  if (exam.state !== "draft") {
    return { ok: false, error: "Published exams are locked. Unpublish it first to edit." };
  }

  const known = await courseTopicIds(exam.courseId);
  if (input.blueprint.sections.some((s) => !known.has(s.topicId))) {
    return { ok: false, error: "A section uses a topic that isn't in this course." };
  }

  const saved = await moveState(exam.id, "draft", {
    title: input.title,
    description: input.description,
    blueprint: input.blueprint,
    settings: input.settings,
  });
  if (!saved) return { ok: false, error: CHANGED };
  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    action: "exam.update",
    entityType: "exam",
    entityId: exam.id,
    before: { title: exam.title, blueprint: exam.blueprint, settings: exam.settings },
    after: { title: input.title, blueprint: input.blueprint, settings: input.settings },
  });
  return { ok: true };
}

/** Pre-flight run server-side, so publishing never trusts the browser's result. */
export async function runPreflight(user: CurrentUser, examId: string) {
  const exam = await getExam(await scopeFor(user), examId);
  if (!exam) return null;
  return (await preflightFor(exam)).report;
}

export async function preflightFor(exam: Pick<typeof exams.$inferSelect, "orgId" | "courseId" | "blueprint" | "settings">) {
  const blueprint = blueprintSchema.parse(exam.blueprint);
  const settings = examSettingsSchema.parse(exam.settings);
  const pool = await loadPool(exam.orgId, exam.courseId);
  const names = await topicNames(exam.orgId, [...new Set(blueprint.sections.map((s) => s.topicId))]);
  const report: PreflightReport = preflightExam({
    blueprint,
    settings,
    pool,
    topicNames: names,
    questionNames: Object.fromEntries(pool.map((q) => [q.id, questionLabel(q.def, 60)])),
  });
  return { report, blueprint, pool };
}

/**
 * Publishing locks every question the exam can draw at its current version,
 * so later edits to a question never change a published exam.
 */
export async function publishExam(user: CurrentUser, examId: string): Promise<ActionResult> {
  const exam = await getExam(await scopeFor(user), examId);
  if (!exam) return { ok: false, error: "That exam no longer exists." };
  if (exam.state !== "draft") return { ok: false, error: "This exam is already published." };

  const { report, blueprint, pool } = await preflightFor(exam);
  if (report.blocking > 0) {
    return { ok: false, error: "Pre-flight found problems that must be fixed first." };
  }

  const topicIds = new Set(blueprint.sections.map((s) => s.topicId));
  const lockedVersions = Object.fromEntries(
    pool.filter((q) => topicIds.has(q.topicId) && q.weight > 0).map((q) => [q.id, q.versionId]),
  );

  if (!(await moveState(examId, "draft", { lockedVersions, state: "scheduled" }))) return { ok: false, error: CHANGED };
  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    action: "exam.publish",
    entityType: "exam",
    entityId: examId,
    before: { state: exam.state },
    after: { state: "scheduled", questions: Object.keys(lockedVersions).length },
  });
  return { ok: true };
}

export async function unpublishExam(user: CurrentUser, examId: string): Promise<ActionResult> {
  const exam = await getExam(await scopeFor(user), examId);
  if (!exam) return { ok: false, error: "That exam no longer exists." };
  if (exam.state !== "scheduled") {
    return { ok: false, error: "Only an exam that hasn't opened yet can go back to draft." };
  }
  const [{ n }] = await db.select({ n: count() }).from(attempts).where(eq(attempts.examId, examId));
  if (n > 0) return { ok: false, error: "Students have already started this exam." };

  if (!(await moveState(examId, "scheduled", { lockedVersions: null, state: "draft" }))) return { ok: false, error: CHANGED };
  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    action: "exam.unpublish",
    entityType: "exam",
    entityId: examId,
    before: { state: exam.state },
    after: { state: "draft" },
  });
  return { ok: true };
}

/**
 * Run-time lifecycle: open, close, release results. Closing ends every
 * in-progress attempt (graded from what was saved), so nothing is left dangling.
 */
export async function setExamState(
  user: CurrentUser,
  examId: string,
  to: ExamStateName,
): Promise<ActionResult> {
  const exam = await getExam(await scopeFor(user), examId);
  if (!exam) return { ok: false, error: "That exam no longer exists." };
  if (!canTransition(exam.state, to)) {
    return { ok: false, error: `An exam that is ${exam.state} can't go to ${to}.` };
  }

  if (!(await moveState(examId, exam.state, { state: to }))) return { ok: false, error: CHANGED };
  if (to === "closed") {
    const open = await db
      .select({ id: attempts.id })
      .from(attempts)
      .where(and(eq(attempts.examId, examId), eq(attempts.state, "in_progress")));
    await finalizeMany(open.map((a) => a.id), user.id, "closed");
  }
  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    action: `exam.${to}`,
    entityType: "exam",
    entityId: examId,
    before: { state: exam.state },
    after: { state: to },
  });
  return { ok: true };
}
