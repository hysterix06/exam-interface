"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import * as topics from "@/server/authoring/topics";

const done = <T extends { ok: boolean }>(r: T) => {
  if (r.ok) revalidatePath("/author", "layout");
  return r;
};

export async function createCourseAction(input: { code: string; title: string }) {
  const user = await requireRole("admin", "instructor");
  return done(await topics.createCourse(user, input));
}

export async function createTopicAction(input: { courseId: string; name: string }) {
  const user = await requireRole("admin", "instructor");
  return done(await topics.createTopic(user, input));
}

export async function renameTopicAction(input: { id: string; name: string }) {
  const user = await requireRole("admin", "instructor");
  return done(await topics.renameTopic(user, input));
}

export async function deleteTopicAction(id: string) {
  const user = await requireRole("admin", "instructor");
  return done(await topics.deleteTopic(user, id));
}
