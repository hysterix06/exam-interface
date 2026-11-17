import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";
import {
  assignmentExtensions,
  assignments,
  courseEvents,
  courses,
  enrollments,
  gradeCategories,
  profiles,
  submissionGrades,
  submissions,
} from "@/db/schema";
import type { LatePenalty } from "@/engine/attempts/late";
import { parseAssignmentSettings, type AssignmentSettings } from "@/engine/assignments/settings";
import { assignmentState, type AssignmentState } from "@/engine/assignments/state";
import type { CalendarItem } from "@/engine/calendar";
import { parseCourseInfo, type CourseInfo } from "@/engine/course";
import { courseGrade, type CourseGrade, type GradebookItem } from "@/engine/gradebook/course-grade";
import type { RubricCriterion } from "@/engine/grading/rubric";
import type { GradeLine } from "@/engine/types";
import type { CurrentUser } from "@/server/auth";
import { listStudentExams, type StudentExam } from "@/server/attempts/student";

// Everything a student sees about their courses, loaded once per request and
// shared by the shell (sidebar counts), the home page, the calendar, the
// grades page and every course tab. Only released grades are ever included.

type Viewer = Pick<CurrentUser, "id" | "orgId">;

export const courseLabel = (c: { code: string | null; title: string }) => (c.code ? `${c.code} · ${c.title}` : c.title);

export type SubmissionStatus = "not-open" | "to-do" | "overdue" | "submitted" | "submitted-late" | "graded" | "excused" | "missing";

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  "not-open": "Not open yet",
  "to-do": "To do",
  overdue: "Overdue",
  submitted: "Handed in",
  "submitted-late": "Handed in late",
  graded: "Graded",
  excused: "Excused",
  missing: "Missing",
};

export interface StudentSubmission {
  id: string;
  version: number;
  submittedAt: string;
  lateMinutes: number;
  text: string | null;
  files: { name: string; bytes: number; mime: string }[];
}

export interface StudentAssignment {
  id: string;
  courseId: string;
  courseLabel: string;
  categoryId: string | null;
  title: string;
  instructions: string | null;
  opensAt: string | null;
  /** This student's due date (extended if they have an extension). */
  dueAt: string | null;
  extended: boolean;
  points: number;
  settings: AssignmentSettings;
  rubric: RubricCriterion[];
  state: AssignmentState;
  released: boolean;
  submission: StudentSubmission | null;
  /** Only once grades are released. */
  grade: { score: number; max: number; lines: GradeLine[]; feedback: string | null; excused: boolean; latePenalty: LatePenalty | null } | null;
  status: SubmissionStatus;
}

export interface StudentCourse {
  id: string;
  code: string | null;
  title: string;
  label: string;
  description: string | null;
  syllabus: string | null;
  term: string | null;
  startsOn: string | null;
  endsOn: string | null;
  info: CourseInfo;
  teachers: { id: string; name: string; email: string }[];
  categories: { id: string; name: string; weight: number; dropLowest: number }[];
  grade: CourseGrade;
  /** Per item: what counted, for the Grades tab. */
  gradeItems: GradebookItem[];
}

function statusOf(state: AssignmentState, sub: StudentSubmission | null, grade: StudentAssignment["grade"], released: boolean): SubmissionStatus {
  if (released && grade?.excused) return "excused";
  if (released && grade) return "graded";
  if (sub) return sub.lateMinutes > 0 ? "submitted-late" : "submitted";
  if (state === "scheduled") return "not-open";
  if (state === "late") return "overdue";
  if (state === "closed") return "missing";
  return "to-do";
}

async function loadAssignments(user: Viewer, courseRows: { id: string; code: string | null; title: string }[], now: Date): Promise<StudentAssignment[]> {
  if (courseRows.length === 0) return [];
  const rows = await db
    .select()
    .from(assignments)
    .where(and(inArray(assignments.courseId, courseRows.map((c) => c.id)), eq(assignments.state, "published")))
    .orderBy(asc(assignments.dueAt), asc(assignments.title));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [exts, subs] = await Promise.all([
    db.select().from(assignmentExtensions).where(and(inArray(assignmentExtensions.assignmentId, ids), eq(assignmentExtensions.userId, user.id))),
    db
      .select({ sub: submissions, grade: submissionGrades })
      .from(submissions)
      .leftJoin(submissionGrades, eq(submissionGrades.submissionId, submissions.id))
      .where(and(inArray(submissions.assignmentId, ids), eq(submissions.userId, user.id)))
      .orderBy(desc(submissions.version)),
  ]);
  const labels = new Map(courseRows.map((c) => [c.id, courseLabel(c)]));
  return rows.map((a) => {
    const settings = parseAssignmentSettings(a.settings);
    const ext = exts.find((e) => e.assignmentId === a.id);
    const due = ext?.dueAt ?? a.dueAt;
    const state = assignmentState({ state: a.state, opensAt: a.opensAt, dueAt: a.dueAt, late: settings.late }, now, ext?.dueAt);
    const latest = subs.find((s) => s.sub.assignmentId === a.id);
    const released = !!a.releasedAt && a.releasedAt <= now;
    const submission: StudentSubmission | null = latest
      ? {
          id: latest.sub.id,
          version: latest.sub.version,
          submittedAt: latest.sub.submittedAt.toISOString(),
          lateMinutes: latest.sub.lateMinutes,
          text: latest.sub.text,
          files: ((latest.sub.files as { name: string; bytes: number; mime: string }[]) ?? []).map((f) => ({ name: f.name, bytes: f.bytes, mime: f.mime })),
        }
      : null;
    const g = latest?.grade;
    const grade =
      released && g
        ? { score: g.score, max: g.max, lines: g.lines as GradeLine[], feedback: g.feedback, excused: g.excused, latePenalty: (g.latePenalty as LatePenalty | null) ?? null }
        : null;
    return {
      id: a.id,
      courseId: a.courseId,
      courseLabel: labels.get(a.courseId) ?? "",
      categoryId: a.categoryId,
      title: a.title,
      instructions: a.instructions,
      opensAt: a.opensAt?.toISOString() ?? null,
      dueAt: due?.toISOString() ?? null,
      extended: !!ext,
      points: a.points,
      settings,
      rubric: (a.rubric as RubricCriterion[]) ?? [],
      state,
      released,
      submission,
      grade,
      status: statusOf(state, submission, grade, released),
    };
  });
}

/** What counts towards a course grade from a student's point of view: released results only. */
export function studentGradeItems(exams: StudentExam[], work: StudentAssignment[]): GradebookItem[] {
  const fromExams = exams.map((e): GradebookItem => {
    const scored = e.attempts.filter((a) => a.score !== null && a.maxScore);
    const best = scored.sort((a, b) => b.score! / b.maxScore! - a.score! / a.maxScore!)[0];
    return { id: e.id, title: e.title, kind: "exam", categoryId: e.categoryId, score: best?.score ?? null, max: best?.maxScore ?? 0 };
  });
  const fromWork = work.map((a): GradebookItem => ({
    id: a.id,
    title: a.title,
    kind: "assignment",
    categoryId: a.categoryId,
    // Missing work counts as zero once grades are out and hand-ins have closed.
    score: a.grade ? a.grade.score : a.released && a.status === "missing" ? 0 : null,
    max: a.grade?.max ?? a.points,
    excused: a.grade?.excused,
  }));
  return [...fromExams, ...fromWork];
}

function calendarItems(exams: StudentExam[], work: StudentAssignment[], events: (typeof courseEvents.$inferSelect)[], labels: Map<string, string>): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const e of exams) {
    const base = { title: e.title, courseId: e.courseId, courseLabel: labels.get(e.courseId) ?? e.courseTitle, href: `/exams/${e.id}` };
    if (e.opensAt) out.push({ ...base, id: `exam-opens:${e.id}`, kind: "exam-opens", startsAt: e.opensAt });
    if (e.closesAt) out.push({ ...base, id: `exam-closes:${e.id}`, kind: "exam-closes", startsAt: e.closesAt });
  }
  for (const a of work) {
    if (!a.dueAt) continue;
    out.push({ id: `due:${a.id}`, kind: "assignment-due", title: a.title, courseId: a.courseId, courseLabel: a.courseLabel, startsAt: a.dueAt, href: `/assignments/${a.id}`, status: STATUS_LABEL[a.status] });
  }
  for (const ev of events) {
    out.push({
      id: `event:${ev.id}`,
      kind: "event",
      eventKind: ev.kind,
      title: ev.title,
      courseId: ev.courseId,
      courseLabel: labels.get(ev.courseId) ?? "",
      startsAt: ev.startsAt.toISOString(),
      endsAt: ev.endsAt?.toISOString() ?? null,
      allDay: ev.allDay,
      location: ev.location,
      description: ev.description,
    });
  }
  return out;
}

const load = cache(async (userId: string, orgId: string) => {
  const user = { id: userId, orgId };
  const now = new Date();
  const courseRows = await db
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      description: courses.description,
      syllabus: courses.syllabus,
      term: courses.term,
      startsOn: courses.startsOn,
      endsOn: courses.endsOn,
      info: courses.info,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(and(eq(enrollments.userId, userId), eq(enrollments.role, "student"), eq(courses.orgId, orgId), isNull(courses.archivedAt)))
    .orderBy(asc(courses.code), asc(courses.title));
  const ids = courseRows.map((c) => c.id);

  const [exams, work, teachers, categories, events] = await Promise.all([
    listStudentExams(user),
    loadAssignments(user, courseRows, now),
    ids.length
      ? db
          .select({ courseId: enrollments.courseId, id: profiles.id, name: profiles.fullName, email: profiles.email })
          .from(enrollments)
          .innerJoin(profiles, eq(profiles.id, enrollments.userId))
          .where(and(inArray(enrollments.courseId, ids), eq(enrollments.role, "teacher"), isNull(profiles.deactivatedAt)))
          .orderBy(asc(profiles.fullName))
      : [],
    ids.length ? db.select().from(gradeCategories).where(inArray(gradeCategories.courseId, ids)).orderBy(asc(gradeCategories.position), asc(gradeCategories.name)) : [],
    ids.length ? db.select().from(courseEvents).where(inArray(courseEvents.courseId, ids)).orderBy(asc(courseEvents.startsAt)) : [],
  ]);

  const labels = new Map(courseRows.map((c) => [c.id, courseLabel(c)]));
  const courseList: StudentCourse[] = courseRows.map((c) => {
    const cats = categories.filter((g) => g.courseId === c.id).map((g) => ({ id: g.id, name: g.name, weight: g.weight, dropLowest: g.dropLowest }));
    const items = studentGradeItems(exams.filter((e) => e.courseId === c.id), work.filter((a) => a.courseId === c.id));
    return {
      ...c,
      label: courseLabel(c),
      info: parseCourseInfo(c.info),
      teachers: teachers.filter((t) => t.courseId === c.id).map((t) => ({ id: t.id, name: t.name ?? t.email, email: t.email })),
      categories: cats,
      grade: courseGrade(cats, items),
      gradeItems: items,
    };
  });

  return { courses: courseList, exams, assignments: work, calendar: calendarItems(exams, work, events, labels), now: now.toISOString() };
});

export type StudentAcademics = Awaited<ReturnType<typeof load>>;

/** Everything for the signed-in student; one query set per request. */
export const studentAcademics = (user: Viewer) => load(user.id, user.orgId);

/** One course the student is enrolled in, or null (callers 404). */
export async function studentCourse(user: Viewer, courseId: string) {
  const all = await studentAcademics(user);
  const course = all.courses.find((c) => c.id === courseId);
  if (!course) return null;
  return {
    course,
    exams: all.exams.filter((e) => e.courseId === courseId),
    assignments: all.assignments.filter((a) => a.courseId === courseId),
    calendar: all.calendar.filter((i) => i.courseId === courseId),
    now: all.now,
  };
}

/** Work that needs doing, soonest first: open exams and assignments not yet handed in. */
export function dueSoon(all: Pick<StudentAcademics, "exams" | "assignments">, now: Date, withinMs: number) {
  const until = now.getTime() + withinMs;
  const work = all.assignments
    .filter((a) => (a.status === "to-do" || a.status === "overdue") && (a.status === "overdue" || !a.dueAt || Date.parse(a.dueAt) <= until))
    .map((a) => ({ kind: "assignment" as const, id: a.id, title: a.title, courseLabel: a.courseLabel, at: a.dueAt, item: a }));
  const exams = all.exams
    .filter((e) => e.inProgressId || (e.state === "open" && e.attemptsLeft > 0))
    .map((e) => ({ kind: "exam" as const, id: e.id, title: e.title, courseLabel: e.courseTitle, at: e.deadlineAt ?? e.closesAt, item: e }));
  return [...exams, ...work].sort((a, b) => (a.at ?? "9999").localeCompare(b.at ?? "9999"));
}

export type WorkTone = "plain" | "muted" | "warning" | "danger" | "success";

/** One row of a student's work list: an exam or an assignment, said the same way. */
export interface WorkItem {
  kind: "exam" | "assignment";
  id: string;
  title: string;
  href: string;
  courseId: string;
  courseLabel: string;
  /** "Due", "Closes", "Opens" plus when, or null. */
  when: { label: string; iso: string } | null;
  status: string;
  tone: WorkTone;
  group: "now" | "upcoming" | "done";
}

const fmtScore = (s: number, m: number) => `${Math.round(s * 100) / 100} / ${Math.round(m * 100) / 100}`;

export function workItems(exams: StudentExam[], work: StudentAssignment[], labels: Map<string, string>): WorkItem[] {
  const fromExams = exams.map((e): WorkItem => {
    const base = { kind: "exam" as const, id: e.id, title: e.title, href: `/exams/${e.id}`, courseId: e.courseId, courseLabel: labels.get(e.courseId) ?? e.courseTitle };
    if (e.inProgressId) return { ...base, when: e.deadlineAt ? { label: "Time runs out", iso: e.deadlineAt } : null, status: "In progress", tone: "warning", group: "now" };
    if (e.state === "open" && e.attemptsLeft > 0) return { ...base, when: e.closesAt ? { label: "Closes", iso: e.closesAt } : null, status: "Open", tone: "plain", group: "now" };
    if (e.state === "scheduled") return { ...base, when: e.opensAt ? { label: "Opens", iso: e.opensAt } : null, status: "Not open yet", tone: "muted", group: "upcoming" };
    const last = e.attempts.find((a) => a.state !== "in_progress");
    const status = !last ? "Not taken" : last.score !== null && last.maxScore ? fmtScore(last.score, last.maxScore) : e.resultsVisible ? "Being marked" : "Results not out yet";
    return { ...base, href: last ? `/exams/${e.id}/results/${last.id}` : base.href, when: e.closesAt ? { label: "Closed", iso: e.closesAt } : null, status, tone: last ? "plain" : "muted", group: "done" };
  });
  const fromWork = work.map((a): WorkItem => {
    const base = { kind: "assignment" as const, id: a.id, title: a.title, href: `/assignments/${a.id}`, courseId: a.courseId, courseLabel: a.courseLabel };
    const due = a.dueAt ? { label: a.extended ? "Due (extended)" : "Due", iso: a.dueAt } : null;
    switch (a.status) {
      case "not-open":
        return { ...base, when: a.opensAt ? { label: "Opens", iso: a.opensAt } : due, status: STATUS_LABEL[a.status], tone: "muted", group: "upcoming" };
      case "to-do":
        return { ...base, when: due, status: STATUS_LABEL[a.status], tone: "plain", group: "now" };
      case "overdue":
        return { ...base, when: due, status: "Overdue · still accepted", tone: "warning", group: "now" };
      case "missing":
        return { ...base, when: due, status: STATUS_LABEL[a.status], tone: "danger", group: "done" };
      case "graded":
        return { ...base, when: due, status: fmtScore(a.grade!.score, a.grade!.max), tone: "plain", group: "done" };
      default:
        return { ...base, when: due, status: STATUS_LABEL[a.status], tone: a.status === "submitted-late" ? "warning" : "success", group: "done" };
    }
  });
  const at = (w: WorkItem) => w.when?.iso ?? "9999";
  return [...fromExams, ...fromWork].sort((a, b) => (a.group === "done" ? at(b).localeCompare(at(a)) : at(a).localeCompare(at(b))) || a.title.localeCompare(b.title));
}
