import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { profiles, submissionGrades, submissions } from "@/db/schema";
import { gradeSubmission } from "@/engine/assignments/grade";
import { overrideLines } from "@/engine/override";
import type { GradeLine } from "@/engine/types";
import type { Scope } from "@/server/access";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";
import { getAssignment, listSubmissionsForStaff, type StaffAssignment } from "./authoring";
import type { SubmissionFile } from "./submit";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

/** One student's hand-ins (newest first) with grades, plus who comes before and after in the marking order. */
export async function loadMarking(a: StaffAssignment, studentId: string) {
  if (!z.guid().safeParse(studentId).success) return null;
  const roster = await listSubmissionsForStaff(a);
  const i = roster.findIndex((r) => r.student.id === studentId);
  if (i < 0) return null;
  const versions = await db
    .select({ sub: submissions, grade: submissionGrades })
    .from(submissions)
    .leftJoin(submissionGrades, eq(submissionGrades.submissionId, submissions.id))
    .where(and(eq(submissions.assignmentId, a.id), eq(submissions.userId, studentId)))
    .orderBy(desc(submissions.version));
  // Next/previous among students who handed something in.
  const handedIn = roster.filter((r) => r.submission);
  const at = handedIn.findIndex((r) => r.student.id === studentId);
  const nextUnmarked = handedIn.find((r, j) => j > at && !r.grade) ?? handedIn.find((r) => !r.grade && r.student.id !== studentId);
  return {
    row: roster[i],
    versions: versions.map((v) => ({ ...v.sub, files: v.sub.files as SubmissionFile[], grade: v.grade ? { ...v.grade, lines: v.grade.lines as GradeLine[] } : null })),
    prev: at > 0 ? handedIn[at - 1].student.id : null,
    next: at >= 0 && at < handedIn.length - 1 ? handedIn[at + 1].student.id : null,
    nextUnmarked: nextUnmarked?.student.id ?? null,
  };
}

const markSchema = z.object({
  submissionId: z.guid(),
  ticked: z.array(z.string().max(40)).max(30).default([]),
  score: z.number().min(0).max(100_000).optional(),
  feedback: z.string().max(20_000).transform((s) => s.trim() || null),
  excused: z.boolean().default(false),
  /** Hand-set total on top of the rubric, with a reason. */
  adjust: z.object({ score: z.number().min(0), reason: z.string().trim().min(1, "Say why the score is changed.").max(500) }).nullish(),
});

/**
 * Marks one hand-in against the rubric (or with a single score), takes any
 * late penalty off, and records it. Lines always add up to the score: a
 * hand-set total becomes one adjustment line, as for exam overrides.
 */
export async function markSubmission(user: CurrentUser, scope: Scope, assignmentId: string, input: unknown): Promise<Result<{ score: number }>> {
  const a = await getAssignment(scope, assignmentId);
  if (!a) return fail("That assignment no longer exists.");
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the marks and try again.");
  const m = parsed.data;
  const [sub] = await db.select().from(submissions).where(and(eq(submissions.id, m.submissionId), eq(submissions.assignmentId, a.id))).limit(1);
  if (!sub) return fail("That hand-in no longer exists.");

  const ids = new Set(a.rubric.map((c) => c.id));
  const g = gradeSubmission({ rubric: a.rubric, points: a.points, ticked: m.ticked.filter((t) => ids.has(t)), score: m.score, lateMinutes: sub.lateMinutes, late: a.settings.late });
  let { lines, score } = g;
  if (m.adjust) {
    if (m.adjust.score > a.points) return fail(`The score can be at most ${a.points}.`);
    const [me] = await db.select({ name: profiles.fullName, email: profiles.email }).from(profiles).where(eq(profiles.id, user.id)).limit(1);
    lines = overrideLines(lines, { score: m.adjust.score, max: a.points, by: me?.name ?? me?.email ?? "a teacher", reason: m.adjust.reason });
    score = m.adjust.score;
  }
  const values = {
    submissionId: sub.id,
    score,
    max: a.points,
    lines,
    ticked: m.ticked,
    feedback: m.feedback,
    latePenalty: g.latePenalty,
    excused: m.excused,
    overrideReason: m.adjust?.reason ?? null,
    graderId: user.id,
    gradedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(submissionGrades).where(eq(submissionGrades.submissionId, sub.id)).limit(1);
    await tx.insert(submissionGrades).values(values).onConflictDoUpdate({ target: submissionGrades.submissionId, set: values });
    await writeAudit(
      {
        orgId: scope.orgId,
        actorId: user.id,
        action: before ? "assignment.remark" : "assignment.mark",
        entityType: "submission",
        entityId: sub.id,
        before: before ? { score: before.score, excused: before.excused } : undefined,
        after: { score, excused: m.excused, student: sub.userId, assignment: a.id },
        reason: m.adjust?.reason,
      },
      tx,
    );
  });
  return { ok: true, score };
}

/** Every rubric line as the marker sees it (weights scaled to points). */
export function rubricForMarker(a: StaffAssignment) {
  const total = a.rubric.reduce((s, c) => s + c.points, 0) || 1;
  return a.rubric.map((c) => ({ id: c.id, text: c.text, points: (a.points * c.points) / total }));
}

