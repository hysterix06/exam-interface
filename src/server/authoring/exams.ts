import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { attempts, courses, exams, topics } from "@/db/schema";
import { finalizeStoredAttempt } from "@/server/attempts/take";
import { preflightExam, type PreflightReport } from "@/engine/authoring/preflight";
import { canTransition, type ExamStateName } from "@/engine/exam-state";
import { examSettingsSchema } from "@/engine/exam";
import { blueprintSchema } from "@/engine/selection/types";
import { questionLabel } from "@/lib/question-label";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "./audit";
import { getExam, loadPool } from "./data";
import type { ActionResult } from "./questions";

export const examInputSchema = z.object({
  id: z.uuid(),
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
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, input.courseId), eq(courses.orgId, user.orgId)))
    .limit(1);
  if (!course) return { ok: false, error: "Choose a course." };

  const [row] = await db
    .insert(exams)
    .values({
      orgId: user.orgId,
      courseId: course.id,
      title,
      blueprint: { sections: [], shuffleQuestions: true },
      settings: examSettingsSchema.parse({}),
      createdBy: user.id,
    })
    .returning({ id: exams.id });
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "exam.create", entityType: "exam", entityId: row.id, after: { title } });
  return { ok: true, id: row.id };
}

async function topicNamesFor(orgId: string, topicIds: string[]) {
  if (topicIds.length === 0) return {};
  const rows = await db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(and(eq(topics.orgId, orgId), inArray(topics.id, topicIds)));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

export async function saveExam(user: CurrentUser, raw: unknown): Promise<ActionResult> {
  const parsed = examInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Some fields are invalid." };
  }
  const input = parsed.data;

  const exam = await getExam(user.orgId, input.id);
  if (!exam) return { ok: false, error: "That exam no longer exists." };
  if (exam.state !== "draft") {
    return { ok: false, error: "Published exams are locked. Unpublish it first to edit." };
  }

  const topicIds = [...new Set(input.blueprint.sections.map((s) => s.topicId))];
  const known = await topicNamesFor(user.orgId, topicIds);
  if (topicIds.some((id) => !(id in known))) {
    return { ok: false, error: "A section uses a topic that no longer exists." };
  }

  await db
    .update(exams)
    .set({
      title: input.title,
      description: input.description,
      blueprint: input.blueprint,
      settings: input.settings,
    })
    .where(eq(exams.id, exam.id));
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
export async function runPreflight(user: CurrentUser, examId: string): Promise<PreflightReport | null> {
  const exam = await getExam(user.orgId, examId);
  if (!exam) return null;
  const blueprint = blueprintSchema.parse(exam.blueprint);
  const settings = examSettingsSchema.parse(exam.settings);
  const pool = await loadPool(user.orgId);
  const topicNames = await topicNamesFor(user.orgId, [...new Set(blueprint.sections.map((s) => s.topicId))]);
  return preflightExam({
    blueprint,
    settings,
    pool,
    topicNames,
    questionNames: Object.fromEntries(pool.map((q) => [q.id, questionLabel(q.def, 60)])),
  });
}

/**
 * Publishing locks every question the exam can draw at its current version,
 * so later edits to a question never change a published exam.
 */
export async function publishExam(user: CurrentUser, examId: string): Promise<ActionResult> {
  const exam = await getExam(user.orgId, examId);
  if (!exam) return { ok: false, error: "That exam no longer exists." };
  if (exam.state !== "draft") return { ok: false, error: "This exam is already published." };

  const report = await runPreflight(user, examId);
  if (!report) return { ok: false, error: "That exam no longer exists." };
  if (report.blocking > 0) {
    return { ok: false, error: "Pre-flight found problems that must be fixed first." };
  }

  const blueprint = blueprintSchema.parse(exam.blueprint);
  const topicIds = new Set(blueprint.sections.map((s) => s.topicId));
  const pool = await loadPool(user.orgId);
  const lockedVersions = Object.fromEntries(
    pool.filter((q) => topicIds.has(q.topicId) && q.weight > 0).map((q) => [q.id, q.versionId]),
  );

  await db.update(exams).set({ lockedVersions, state: "scheduled" }).where(eq(exams.id, examId));
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
  const exam = await getExam(user.orgId, examId);
  if (!exam) return { ok: false, error: "That exam no longer exists." };
  if (exam.state !== "scheduled") {
    return { ok: false, error: "Only an exam that hasn't opened yet can go back to draft." };
  }
  const [{ n }] = await db.select({ n: count() }).from(attempts).where(eq(attempts.examId, examId));
  if (n > 0) return { ok: false, error: "Students have already started this exam." };

  await db.update(exams).set({ lockedVersions: null, state: "draft" }).where(eq(exams.id, examId));
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
  const exam = await getExam(user.orgId, examId);
  if (!exam) return { ok: false, error: "That exam no longer exists." };
  if (!canTransition(exam.state, to)) {
    return { ok: false, error: `An exam that is ${exam.state} can't go to ${to}.` };
  }

  if (to === "closed") {
    const open = await db
      .select({ id: attempts.id })
      .from(attempts)
      .where(and(eq(attempts.examId, examId), eq(attempts.state, "in_progress")));
    for (const a of open) await finalizeStoredAttempt(a.id, user.id, "closed");
  }

  await db.update(exams).set({ state: to }).where(eq(exams.id, examId));
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
