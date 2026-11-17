import "server-only";
import { z } from "zod";
import { db } from "@/db/client";
import { submissions } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { scopeFor } from "@/server/access";
import type { CurrentUser } from "@/server/auth";
import { getAssignment, listCourseAssignments, listSubmissionsForStaff } from "@/server/assignments/authoring";
import { getCourse, getExam, listCourses, listExams } from "@/server/authoring/data";
import { collectData } from "@/server/data-export/collect";
import { listExportSummary } from "@/server/run/data";
import { studentAcademics, studentCourse } from "@/server/student/academics";
import { listCategories, listEvents, staffCourseCalendar } from "@/server/teach/course";
import { courseGradebook } from "@/server/teach/gradebook";

// The read-only API, as a table of routes. Every handler calls the same
// scoped loaders as the app's pages, so a token sees exactly what its owner
// sees and nothing more. Lists are paginated; out-of-scope ids are 404.

export class NotFound extends Error {}

type Params = Record<string, string>;
type Handler = (user: CurrentUser, p: Params, url: URL) => Promise<unknown>;

export interface ApiRoute {
  path: string;
  summary: string;
  list?: boolean;
  handler: Handler;
}

const guid = (s: string) => {
  if (!z.guid().safeParse(s).success) throw new NotFound();
  return s;
};
const found = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw new NotFound();
  return v;
};
const isStudent = (u: CurrentUser) => u.role === "student";

async function staffCourse(user: CurrentUser, id: string) {
  const scope = await scopeFor(user);
  return { scope, course: found(await getCourse(scope, guid(id))) };
}

function serializeGradebook(b: Awaited<ReturnType<typeof courseGradebook>>) {
  return {
    columns: b.columns,
    categories: b.categories,
    rows: b.rows.map((r) => ({ student: r.student, grade: { percent: r.grade.percent, working: r.grade.lines }, cells: Object.fromEntries(r.cells) })),
  };
}

export const ROUTES: ApiRoute[] = [
  {
    path: "/me",
    summary: "Who this token belongs to.",
    handler: async (u) => ({ id: u.id, email: u.email, name: u.fullName, role: u.role }),
  },
  {
    path: "/courses",
    summary: "Your courses (students: enrolled; teachers: taught; admins: all).",
    list: true,
    handler: async (u) => (isStudent(u) ? (await studentAcademics(u)).courses : listCourses(await scopeFor(u))),
  },
  {
    path: "/courses/{courseId}",
    summary: "One course: homepage details, syllabus, weights (and for staff, calendar events).",
    handler: async (u, p) => {
      if (isStudent(u)) return found(await studentCourse(u, guid(p.courseId))).course;
      const { course } = await staffCourse(u, p.courseId);
      const [categories, events] = await Promise.all([listCategories(course.id), listEvents(course.id)]);
      return { ...course, categories, events };
    },
  },
  {
    path: "/courses/{courseId}/calendar",
    summary: "Every dated item in one course: exam windows, due dates and events.",
    list: true,
    handler: async (u, p) => (isStudent(u) ? found(await studentCourse(u, guid(p.courseId))).calendar : staffCourseCalendar((await staffCourse(u, p.courseId)).course)),
  },
  {
    path: "/courses/{courseId}/grades",
    summary: "Students: your course grade with its working and each item. Staff: the gradebook.",
    handler: async (u, p) => {
      if (isStudent(u)) {
        const c = found(await studentCourse(u, guid(p.courseId))).course;
        return { percent: c.grade.percent, working: c.grade.lines, categories: c.grade.categories, items: c.gradeItems };
      }
      const { course } = await staffCourse(u, p.courseId);
      return serializeGradebook(await courseGradebook(course.id));
    },
  },
  {
    path: "/calendar",
    summary: "Every dated item across your courses.",
    list: true,
    handler: async (u) => {
      if (isStudent(u)) return (await studentAcademics(u)).calendar;
      const courses = await listCourses(await scopeFor(u));
      return (await Promise.all(courses.map(staffCourseCalendar))).flat().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },
  },
  {
    path: "/assignments",
    summary: "Assignments across your courses (students: with your status and released grades).",
    list: true,
    handler: async (u) => {
      if (isStudent(u)) return (await studentAcademics(u)).assignments;
      const scope = await scopeFor(u);
      const courses = await listCourses(scope);
      return (await Promise.all(courses.map((c) => listCourseAssignments(scope, c.id)))).flat();
    },
  },
  {
    path: "/assignments/{assignmentId}",
    summary: "One assignment.",
    handler: async (u, p) => {
      if (isStudent(u)) return found((await studentAcademics(u)).assignments.find((a) => a.id === guid(p.assignmentId)));
      return found(await getAssignment(await scopeFor(u), guid(p.assignmentId)));
    },
  },
  {
    path: "/assignments/{assignmentId}/submissions",
    summary: "Students: every version you handed in. Staff: each student's latest hand-in, grade and extension.",
    list: true,
    handler: async (u, p) => {
      if (isStudent(u)) {
        const a = found((await studentAcademics(u)).assignments.find((x) => x.id === guid(p.assignmentId)));
        return db.select().from(submissions).where(and(eq(submissions.assignmentId, a.id), eq(submissions.userId, u.id))).orderBy(asc(submissions.version));
      }
      return listSubmissionsForStaff(found(await getAssignment(await scopeFor(u), guid(p.assignmentId))));
    },
  },
  {
    path: "/exams",
    summary: "Exams across your courses (students: with your attempts; scores only once released).",
    list: true,
    handler: async (u) => (isStudent(u) ? (await studentAcademics(u)).exams : listExams(await scopeFor(u))),
  },
  {
    path: "/exams/{examId}/attempts",
    summary: "Students: your attempts. Staff: one row per student with score and timing.",
    list: true,
    handler: async (u, p) => {
      if (isStudent(u)) return found((await studentAcademics(u)).exams.find((e) => e.id === guid(p.examId))).attempts;
      const scope = await scopeFor(u);
      found(await getExam(scope, guid(p.examId)));
      return listExportSummary(scope, p.examId);
    },
  },
  {
    path: "/export",
    summary: "Everything, as JSON tables (the same data as the ZIP download, without files).",
    handler: async (u) => {
      const d = await collectData(u);
      return { manifest: d.manifest, tables: d.tables };
    },
  },
];

/** Finds the route for "/courses/abc/grades" and pulls out its parameters. */
export function matchRoute(path: string): { route: ApiRoute; params: Params } | null {
  const parts = path.split("/").filter(Boolean);
  for (const route of ROUTES) {
    const pat = route.path.split("/").filter(Boolean);
    if (pat.length !== parts.length) continue;
    const params: Params = {};
    if (pat.every((seg, i) => (seg.startsWith("{") ? ((params[seg.slice(1, -1)] = decodeURIComponent(parts[i])), true) : seg === parts[i]))) return { route, params };
  }
  return null;
}

/** ?cursor=&limit= over a list; the cursor is opaque to clients. */
export function paginate<T>(rows: T[], url: URL) {
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100));
  const raw = url.searchParams.get("cursor");
  const offset = raw ? Number(Buffer.from(raw, "base64url").toString()) || 0 : 0;
  const page = rows.slice(offset, offset + limit);
  const next = offset + limit < rows.length ? Buffer.from(String(offset + limit)).toString("base64url") : null;
  return { data: page, next, total: rows.length };
}

/** An OpenAPI 3.1 description of the routes above. */
export function openApi(origin: string) {
  const paths: Record<string, unknown> = {};
  for (const r of ROUTES) {
    const params = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string", format: "uuid" } }));
    const page = r.list
      ? [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
          { name: "cursor", in: "query", schema: { type: "string" }, description: "The `next` value from the previous page." },
        ]
      : [];
    paths[r.path] = {
      get: {
        summary: r.summary,
        parameters: [...params, ...page],
        responses: {
          200: {
            description: r.list ? "A page of results: `{ data: [...], next, total }`." : "`{ data: {...} }`",
            content: { "application/json": { schema: r.list ? { type: "object", properties: { data: { type: "array", items: { type: "object" } }, next: { type: ["string", "null"] }, total: { type: "integer" } } } : { type: "object", properties: { data: { type: "object" } } } } },
          },
          401: { description: "Missing, revoked or expired token." },
          404: { description: "Not found, or not yours to see." },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Modus API", version: "1", description: "Read-only access to everything you can see in Modus. Create a token under Account → Your data, and send it as `Authorization: Bearer <token>`." },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ bearer: [] }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    paths,
  };
}
