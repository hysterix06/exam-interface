"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@/lib/auth/roles";
import { parseRoster } from "@/lib/roster";
import { requireAdmin } from "@/server/access";
import * as courses from "@/server/admin/courses";
import { saveOrg } from "@/server/admin/org";
import * as people from "@/server/admin/people";

const id = z.guid();
const invalid = { ok: false as const, error: "That item no longer exists." };

const done = <T extends { ok: boolean }>(r: T) => {
  if (r.ok) revalidatePath("/", "layout");
  return r;
};

// People

export async function addPersonAction(input: unknown) {
  const { user } = await requireAdmin();
  return done(await people.addPerson(user, input));
}

/** Parse only: the admin sees exactly who will be added before committing. */
export async function previewImportAction(text: string) {
  await requireAdmin();
  return parseRoster(String(text).slice(0, 200_000));
}

export async function importPeopleAction(input: { text: string; defaultRole: Role; courseId: string | null }) {
  const { user } = await requireAdmin();
  if (input.courseId && !id.safeParse(input.courseId).success) return invalid;
  const { rows } = parseRoster(String(input.text).slice(0, 200_000));
  return done(await people.importPeople(user, { rows, defaultRole: input.defaultRole, courseId: input.courseId }));
}

export async function setRoleAction(input: { id: string; role: Role }) {
  const { user } = await requireAdmin();
  return done(await people.setRole(user, input));
}

export async function setActiveAction(input: { id: string; active: boolean }) {
  const { user } = await requireAdmin();
  return done(await people.setActive(user, { id: input.id, active: input.active === true }));
}

export async function resetPasswordAction(personId: string) {
  const { user } = await requireAdmin();
  return people.resetPassword(user, personId);
}

// Courses

export async function createCourseAction(input: { code: string; title: string }) {
  const { user } = await requireAdmin();
  return done(await courses.createCourse(user, input));
}

export async function updateCourseAction(courseId: string, input: { code: string; title: string }) {
  const { user } = await requireAdmin();
  return done(await courses.updateCourse(user, courseId, input));
}

export async function setArchivedAction(courseId: string, archived: boolean) {
  const { user } = await requireAdmin();
  return done(await courses.setArchived(user, courseId, archived === true));
}

export async function addMembersAction(input: { courseId: string; emails: string; role: "teacher" | "student" }) {
  const { user } = await requireAdmin();
  if (!id.safeParse(input.courseId).success) return invalid;
  if (input.role !== "teacher" && input.role !== "student") return invalid;
  const emails = parseRoster(String(input.emails).slice(0, 200_000)).rows.map((r) => r.email);
  return done(await courses.addMembers(user, { courseId: input.courseId, emails, role: input.role }));
}

export async function removeMemberAction(input: { courseId: string; userId: string }) {
  const { user } = await requireAdmin();
  if (!id.safeParse(input.courseId).success || !id.safeParse(input.userId).success) return invalid;
  return done(await courses.removeMember(user, input));
}

// Organisation

export async function saveOrgAction(input: unknown) {
  const { user } = await requireAdmin();
  return done(await saveOrg(user, input));
}
