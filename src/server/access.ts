import "server-only";
import { and, eq, inArray, isNull, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";
import { courses, enrollments } from "@/db/schema";
import type { Role } from "@/lib/auth/roles";
import { type CurrentUser, requireRole } from "@/server/auth";

/**
 * What a staff member may see and change. Admins see the whole org
 * (`courseIds: null`); instructors see only courses they teach.
 */
export type Scope = {
  orgId: string;
  userId: string;
  role: Role;
  courseIds: string[] | null;
};

export const scopeFor = cache(async (user: CurrentUser): Promise<Scope> => {
  const base = { orgId: user.orgId, userId: user.id, role: user.role };
  if (user.role === "admin") return { ...base, courseIds: null };
  if (user.role === "student") return { ...base, courseIds: [] };
  const rows = await db
    .select({ id: enrollments.courseId })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(
      and(
        eq(enrollments.userId, user.id),
        eq(enrollments.role, "teacher"),
        eq(courses.orgId, user.orgId),
        isNull(courses.archivedAt),
      ),
    );
  return { ...base, courseIds: rows.map((r) => r.id) };
});

// Ids from the browser are checked with z.guid(), not z.uuid(): Zod's uuid()
// enforces RFC version bits, and fixed seed ids (…0000c1) aren't v4.

/** SQL condition restricting a course id column to the scope; undefined means no restriction. */
export function inScope(column: AnyColumn, scope: Scope): SQL | undefined {
  if (scope.courseIds === null) return undefined;
  if (scope.courseIds.length === 0) return sql`false`;
  return inArray(column, scope.courseIds);
}

export function canTeach(scope: Scope, courseId: string) {
  return scope.courseIds === null || scope.courseIds.includes(courseId);
}

/** Every staff page, layout and action starts here. */
export async function requireStaff() {
  const user = await requireRole("admin", "instructor");
  return { user, scope: await scopeFor(user) };
}

/** Admin-only pages and actions. */
export async function requireAdmin() {
  const user = await requireRole("admin");
  return { user, scope: await scopeFor(user) };
}
