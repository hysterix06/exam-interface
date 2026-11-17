import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assignmentExtensions,
  assignments,
  attemptItems,
  attempts,
  auditLog,
  courseEvents,
  courses,
  enrollments,
  exams,
  extensions,
  gradeCategories,
  grades,
  orgs,
  profiles,
  questions,
  questionVersions,
  responses,
  submissionGrades,
  submissions,
  topics,
} from "@/db/schema";
import { ensureTypesReady, getQuestionType } from "@/question-types/registry";
import { scopeFor } from "@/server/access";
import type { CurrentUser } from "@/server/auth";
import type { SubmissionFile } from "@/server/assignments/submit";
import { loadResults } from "@/server/attempts/results";
import { studentAcademics } from "@/server/student/academics";
import { courseGradebook, gradebookCsvRows } from "@/server/teach/gradebook";

// Everything a person may see, as plain tables, for the ZIP export and the
// API. Students get their own data, shaped by the same release rules as the
// app (no answer keys or scores before release); teachers get their courses;
// admins get the whole organisation. Nothing here decides access on its own:
// it reuses the scoped loaders the pages use.

export type Row = Record<string, unknown>;

export interface DataExport {
  manifest: {
    format: "modus-export";
    version: 1;
    exportedAt: string;
    person: { id: string; email: string; name: string | null; role: string };
    scope: string;
    tables: Record<string, number>;
    files: number;
  };
  tables: Record<string, Row[]>;
  /** Extra CSVs that aren't plain tables (gradebooks). */
  sheets: Record<string, (string | number | null)[][]>;
  files: { path: string; zipPath: string }[];
}

/** What each table holds, in words, for the README. */
export const TABLE_NOTES: Record<string, string> = {
  profile: "You.",
  courses: "Courses, with description, syllabus and contact details.",
  course_grades: "Your grade in each course so far, with the working.",
  grade_categories: "Grade weights per course.",
  calendar: "Every dated item: exam windows, due dates, class events.",
  exams: "Exams you can see, and your attempts.",
  exam_answers: "What you were asked (without answer keys) and what you answered, for every finished attempt.",
  exam_results: "Your marked results, only where your teacher has released them.",
  assignments: "Assignments, with rubric and your status.",
  submissions: "Everything you handed in, every version.",
  assignment_grades: "Your released assignment marks and feedback.",
  enrollments: "Who is in which course.",
  people: "Everyone in the organisation.",
  course_events: "Calendar entries teachers added.",
  topics: "Question bank topics.",
  questions: "Questions (working copies).",
  question_versions: "Every saved version of every question; exams use these.",
  attempts: "Every attempt by every student.",
  attempt_items: "The exact generated question each student saw, with its answer key.",
  responses: "Every answer.",
  grades: "Every mark, with the grader's line-by-line explanation.",
  extensions: "Extra time on exams.",
  assignment_extensions: "Later due dates on assignments.",
  submission_grades: "Every assignment mark and feedback.",
  audit_log: "Everything staff changed, who and when.",
  org: "The organisation and its defaults.",
};

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

function fileRefs(subs: { id: string; files: unknown }[]) {
  return subs.flatMap((s) => (s.files as SubmissionFile[]).map((f, i) => ({ path: f.path, zipPath: `files/submissions/${s.id}/${i}-${f.name.replace(/[^\w.\- ]+/g, "_")}` })));
}

async function forStudent(user: CurrentUser): Promise<Omit<DataExport, "manifest">> {
  const all = await studentAcademics(user);
  const finished = all.exams.flatMap((e) => e.attempts.filter((a) => a.state !== "in_progress").map((a) => ({ exam: e, attempt: a })));
  const ids = finished.map((f) => f.attempt.id);

  const [answers, results, subs] = await Promise.all([
    ids.length
      ? db
          .select({ attemptId: attemptItems.attemptId, position: attemptItems.position, type: questionVersions.type, instance: attemptItems.instance, response: responses.response })
          .from(attemptItems)
          .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
          .leftJoin(responses, eq(responses.attemptItemId, attemptItems.id))
          .where(inArray(attemptItems.attemptId, ids))
          .orderBy(asc(attemptItems.attemptId), asc(attemptItems.position))
      : [],
    Promise.all(ids.map((id) => loadResults(user, id))),
    all.assignments.length
      ? db
          .select()
          .from(submissions)
          .where(and(eq(submissions.userId, user.id), inArray(submissions.assignmentId, all.assignments.map((a) => a.id))))
          .orderBy(asc(submissions.assignmentId), asc(submissions.version))
      : [],
  ]);

  return {
    tables: {
      profile: [{ id: user.id, email: user.email, name: user.fullName, phone: user.phone, role: user.role }],
      courses: all.courses.map((c) => ({ id: c.id, code: c.code, title: c.title, term: c.term, startsOn: c.startsOn, endsOn: c.endsOn, description: c.description, syllabus: c.syllabus, info: c.info, teachers: c.teachers })),
      grade_categories: all.courses.flatMap((c) => c.categories.map((g) => ({ courseId: c.id, ...g }))),
      course_grades: all.courses.map((c) => ({ courseId: c.id, course: c.label, percent: c.grade.percent, working: c.grade.lines.join(" ") })),
      calendar: all.calendar.map(({ href: _h, ...i }) => i),
      exams: all.exams.map((e) => ({ id: e.id, courseId: e.courseId, title: e.title, state: e.state, opensAt: e.opensAt, closesAt: e.closesAt, attempts: e.attempts })),
      // The question as the student saw it: redacted, never the answer key.
      exam_answers: answers.map((a) => ({ attemptId: a.attemptId, position: a.position, type: a.type, question: getQuestionType(a.type).redact(a.instance as never), yourAnswer: a.response })),
      exam_results: results.flatMap((r, i) => (r && !("hidden" in r) ? [{ attemptId: ids[i], ...(r as object) }] : [])),
      assignments: all.assignments.map(({ grade: _g, submission: _s, ...a }) => a),
      submissions: subs.map((s) => ({ id: s.id, assignmentId: s.assignmentId, version: s.version, submittedAt: iso(s.submittedAt), lateMinutes: s.lateMinutes, text: s.text, files: (s.files as SubmissionFile[]).map((f) => ({ name: f.name, bytes: f.bytes, mime: f.mime, sha256: f.sha256 })) })),
      assignment_grades: all.assignments.flatMap((a) => (a.grade ? [{ assignmentId: a.id, title: a.title, ...a.grade }] : [])),
    },
    sheets: {},
    files: fileRefs(subs),
  };
}

async function forStaff(user: CurrentUser): Promise<Omit<DataExport, "manifest">> {
  const scope = await scopeFor(user);
  const courseRows = await db
    .select()
    .from(courses)
    .where(and(eq(courses.orgId, user.orgId), scope.courseIds === null ? undefined : inArray(courses.id, scope.courseIds.length ? scope.courseIds : ["00000000-0000-0000-0000-000000000000"])))
    .orderBy(asc(courses.title));
  const cids = courseRows.length ? courseRows.map((c) => c.id) : ["00000000-0000-0000-0000-000000000000"];

  const [enr, cats, evs, tps, examRows, workRows] = await Promise.all([
    db
      .select({ courseId: enrollments.courseId, userId: enrollments.userId, role: enrollments.role, name: profiles.fullName, email: profiles.email, since: enrollments.createdAt })
      .from(enrollments)
      .innerJoin(profiles, eq(profiles.id, enrollments.userId))
      .where(inArray(enrollments.courseId, cids)),
    db.select().from(gradeCategories).where(inArray(gradeCategories.courseId, cids)),
    db.select().from(courseEvents).where(inArray(courseEvents.courseId, cids)),
    db.select().from(topics).where(inArray(topics.courseId, cids)),
    db.select().from(exams).where(inArray(exams.courseId, cids)),
    db.select().from(assignments).where(inArray(assignments.courseId, cids)),
  ]);
  const topicIds = tps.length ? tps.map((t) => t.id) : ["00000000-0000-0000-0000-000000000000"];
  const examIds = examRows.length ? examRows.map((e) => e.id) : ["00000000-0000-0000-0000-000000000000"];
  const workIds = workRows.length ? workRows.map((a) => a.id) : ["00000000-0000-0000-0000-000000000000"];

  const [qs, att, exts, subs, workExts] = await Promise.all([
    db.select().from(questions).where(inArray(questions.topicId, topicIds)),
    db.select().from(attempts).where(and(inArray(attempts.examId, examIds), eq(attempts.isPreview, false))),
    db.select().from(extensions).where(inArray(extensions.examId, examIds)),
    db.select().from(submissions).where(inArray(submissions.assignmentId, workIds)).orderBy(asc(submissions.assignmentId), asc(submissions.version)),
    db.select().from(assignmentExtensions).where(inArray(assignmentExtensions.assignmentId, workIds)),
  ]);
  const qids = qs.length ? qs.map((q) => q.id) : ["00000000-0000-0000-0000-000000000000"];
  const aids = att.length ? att.map((a) => a.id) : ["00000000-0000-0000-0000-000000000000"];
  const sids = subs.length ? subs.map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"];

  const [versions, items, resp, grd, subGrades] = await Promise.all([
    db.select().from(questionVersions).where(inArray(questionVersions.questionId, qids)),
    db.select().from(attemptItems).where(inArray(attemptItems.attemptId, aids)),
    db.select({ r: responses, attemptId: attemptItems.attemptId }).from(responses).innerJoin(attemptItems, eq(attemptItems.id, responses.attemptItemId)).where(inArray(attemptItems.attemptId, aids)),
    db.select({ g: grades, attemptId: attemptItems.attemptId }).from(grades).innerJoin(attemptItems, eq(attemptItems.id, grades.attemptItemId)).where(inArray(attemptItems.attemptId, aids)),
    db.select().from(submissionGrades).where(inArray(submissionGrades.submissionId, sids)),
  ]);

  const books = await Promise.all(courseRows.map(async (c) => [c, await courseGradebook(c.id)] as const));
  const sheets: DataExport["sheets"] = {};
  for (const [c, b] of books) sheets[`gradebook-${(c.code ?? c.title).replace(/[^A-Za-z0-9]+/g, "-")}-${c.id.slice(0, 8)}`] = gradebookCsvRows(b);

  const tables: DataExport["tables"] = {
    courses: courseRows,
    enrollments: enr,
    grade_categories: cats,
    course_events: evs,
    topics: tps,
    questions: qs,
    question_versions: versions,
    exams: examRows,
    attempts: att,
    attempt_items: items,
    responses: resp.map((x) => ({ ...x.r, attemptId: x.attemptId })),
    grades: grd.map((x) => ({ ...x.g, attemptId: x.attemptId })),
    extensions: exts,
    assignments: workRows,
    submissions: subs,
    submission_grades: subGrades,
    assignment_extensions: workExts,
  };

  if (user.role === "admin") {
    const [people, audit, org] = await Promise.all([
      db.select({ id: profiles.id, email: profiles.email, name: profiles.fullName, phone: profiles.phone, role: profiles.role, deactivatedAt: profiles.deactivatedAt, createdAt: profiles.createdAt }).from(profiles).where(eq(profiles.orgId, user.orgId)),
      db.select().from(auditLog).where(eq(auditLog.orgId, user.orgId)).orderBy(desc(auditLog.ts)).limit(100_000),
      db.select().from(orgs).where(eq(orgs.id, user.orgId)),
    ]);
    tables.people = people;
    tables.audit_log = audit;
    tables.org = org;
  }
  return { tables, sheets, files: fileRefs(subs) };
}

export async function collectData(user: CurrentUser): Promise<DataExport> {
  await ensureTypesReady();
  const body = user.role === "student" ? await forStudent(user) : await forStaff(user);
  return {
    manifest: {
      format: "modus-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      person: { id: user.id, email: user.email, name: user.fullName, role: user.role },
      scope: user.role === "student" ? "Your own data" : user.role === "admin" ? "The whole organisation" : "The courses you teach",
      tables: Object.fromEntries(Object.entries(body.tables).map(([k, v]) => [k, v.length])),
      files: body.files.length,
    },
    ...body,
  };
}
