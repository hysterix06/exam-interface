"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/access";
import { deleteEvent, saveCategories, saveCourseDetails, saveEvent, setItemCategory } from "@/server/teach/course";

// Every action re-authorizes; the server functions check the course is yours.
const done = <T extends { ok: boolean }>(r: T) => {
  if (r.ok) revalidatePath("/", "layout");
  return r;
};

export async function saveCourseDetailsAction(courseId: string, input: unknown) {
  const { user, scope } = await requireStaff();
  return done(await saveCourseDetails(user, scope, courseId, input));
}

export async function saveCategoriesAction(courseId: string, input: unknown) {
  const { user, scope } = await requireStaff();
  return done(await saveCategories(user, scope, courseId, input));
}

export async function setItemCategoryAction(input: { kind: "exam" | "assignment"; id: string; categoryId: string | null }) {
  const { user, scope } = await requireStaff();
  if (input.kind !== "exam" && input.kind !== "assignment") return { ok: false as const, error: "That item no longer exists." };
  return done(await setItemCategory(user, scope, input));
}

export async function saveEventAction(courseId: string, input: unknown) {
  const { user, scope } = await requireStaff();
  return done(await saveEvent(user, scope, courseId, input));
}

export async function deleteEventAction(courseId: string, eventId: string) {
  const { user, scope } = await requireStaff();
  return done(await deleteEvent(user, scope, courseId, eventId));
}
