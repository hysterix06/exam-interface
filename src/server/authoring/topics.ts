import "server-only";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { questions, topics } from "@/db/schema";
import { canTeach, scopeFor } from "@/server/access";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "./audit";
import { getCourse } from "./data";
import type { ActionResult } from "./questions";

const name = z.string().trim().min(1, "Give the topic a name.").max(120);

/** A topic the user may edit, or null. */
async function ownTopic(user: CurrentUser, id: string) {
  if (!z.guid().safeParse(id).success) return null;
  const [row] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.id, id), eq(topics.orgId, user.orgId)))
    .limit(1);
  return row && canTeach(await scopeFor(user), row.courseId) ? row : null;
}

export async function createTopic(
  user: CurrentUser,
  input: { courseId: string; name: string },
): Promise<ActionResult<{ id: string }>> {
  const parsed = name.safeParse(input.name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!z.guid().safeParse(input.courseId).success) return { ok: false, error: "That course no longer exists." };
  const course = await getCourse(await scopeFor(user), input.courseId);
  if (!course) return { ok: false, error: "That course no longer exists." };

  const [{ n }] = await db.select({ n: count() }).from(topics).where(eq(topics.courseId, course.id));
  const [row] = await db
    .insert(topics)
    .values({ orgId: user.orgId, courseId: course.id, name: parsed.data, position: n })
    .returning({ id: topics.id });
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "topic.create", entityType: "topic", entityId: row.id, after: { name: parsed.data } });
  return { ok: true, id: row.id };
}

export async function renameTopic(
  user: CurrentUser,
  input: { id: string; name: string },
): Promise<ActionResult> {
  const parsed = name.safeParse(input.name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const topic = await ownTopic(user, input.id);
  if (!topic) return { ok: false, error: "That topic no longer exists." };
  await db.update(topics).set({ name: parsed.data }).where(eq(topics.id, topic.id));
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "topic.rename", entityType: "topic", entityId: topic.id, before: { name: topic.name }, after: { name: parsed.data } });
  return { ok: true };
}

export async function deleteTopic(user: CurrentUser, id: string): Promise<ActionResult> {
  const topic = await ownTopic(user, id);
  if (!topic) return { ok: false, error: "That topic no longer exists." };
  const [{ n }] = await db.select({ n: count() }).from(questions).where(eq(questions.topicId, topic.id));
  if (n > 0) {
    return { ok: false, error: `This topic has ${n} question${n === 1 ? "" : "s"}. Move or archive them first.` };
  }
  await db.delete(topics).where(eq(topics.id, topic.id));
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "topic.delete", entityType: "topic", entityId: topic.id, before: { name: topic.name } });
  return { ok: true };
}
