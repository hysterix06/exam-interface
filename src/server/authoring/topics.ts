import "server-only";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { courses, questions, topics } from "@/db/schema";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "./audit";
import type { ActionResult } from "./questions";

export async function createCourse(
  user: CurrentUser,
  input: { code: string; title: string },
): Promise<ActionResult<{ id: string }>> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the course a title." };
  const [row] = await db
    .insert(courses)
    .values({ orgId: user.orgId, title, code: input.code.trim() || null })
    .returning({ id: courses.id });
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "course.create", entityType: "course", entityId: row.id, after: { title } });
  return { ok: true, id: row.id };
}

export async function createTopic(
  user: CurrentUser,
  input: { courseId: string; name: string },
): Promise<ActionResult<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the topic a name." };
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, input.courseId), eq(courses.orgId, user.orgId)))
    .limit(1);
  if (!course) return { ok: false, error: "That course no longer exists." };

  const [{ n }] = await db.select({ n: count() }).from(topics).where(eq(topics.courseId, course.id));
  const [row] = await db
    .insert(topics)
    .values({ orgId: user.orgId, courseId: course.id, name, position: n })
    .returning({ id: topics.id });
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "topic.create", entityType: "topic", entityId: row.id, after: { name } });
  return { ok: true, id: row.id };
}

export async function renameTopic(
  user: CurrentUser,
  input: { id: string; name: string },
): Promise<ActionResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the topic a name." };
  const updated = await db
    .update(topics)
    .set({ name })
    .where(and(eq(topics.id, input.id), eq(topics.orgId, user.orgId)))
    .returning({ id: topics.id });
  if (updated.length === 0) return { ok: false, error: "That topic no longer exists." };
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "topic.rename", entityType: "topic", entityId: input.id, after: { name } });
  return { ok: true };
}

export async function deleteTopic(user: CurrentUser, id: string): Promise<ActionResult> {
  const [{ n }] = await db.select({ n: count() }).from(questions).where(eq(questions.topicId, id));
  if (n > 0) {
    return { ok: false, error: `This topic has ${n} question${n === 1 ? "" : "s"}. Move or archive them first.` };
  }
  const deleted = await db
    .delete(topics)
    .where(and(eq(topics.id, id), eq(topics.orgId, user.orgId)))
    .returning({ id: topics.id });
  if (deleted.length === 0) return { ok: false, error: "That topic no longer exists." };
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "topic.delete", entityType: "topic", entityId: id });
  return { ok: true };
}
