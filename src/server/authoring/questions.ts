import "server-only";
import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { questions, questionVersions, topics } from "@/db/schema";
import type { CurrentUser } from "@/server/auth";
import { questionTypes } from "@/question-types/registry";
import { writeAudit } from "./audit";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const questionInputSchema = z.object({
  id: z.uuid().optional(),
  topicId: z.uuid(),
  type: z.string(),
  def: z.unknown(),
  weight: z.number().min(0).max(1000),
  difficulty: z.number().int().min(1).max(5),
  points: z.number().min(0).max(1000),
  tags: z.array(z.string().trim().min(1)).max(20),
  groupKey: z.string().trim().min(1).nullable(),
  status: z.enum(["draft", "active", "archived"]),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

/**
 * Create or update a question. Every change to its content writes a new
 * immutable version; exams and attempts only ever reference versions.
 * A question can only be made active once it has no blocking issues, the same
 * rule the editor shows live.
 */
export async function saveQuestion(
  user: CurrentUser,
  raw: unknown,
): Promise<ActionResult<{ id: string; version: number }>> {
  const input = questionInputSchema.safeParse(raw);
  if (!input.success) return { ok: false, error: "Some fields are invalid. Check the numbers and try again." };
  const q = input.data;

  const type = questionTypes.get(q.type);
  if (!type) return { ok: false, error: `Unknown question type "${q.type}".` };
  const def = type.defSchema.safeParse(q.def);
  if (!def.success) return { ok: false, error: "The question is incomplete or malformed." };

  if (q.status === "active") {
    const blocking = type.validateDef(def.data).filter((i) => i.severity === "blocking");
    if (blocking.length) {
      return { ok: false, error: `Can't activate yet: ${blocking.map((i) => i.message).join(" ")}` };
    }
  }

  const [topic] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.id, q.topicId), eq(topics.orgId, user.orgId)))
    .limit(1);
  if (!topic) return { ok: false, error: "That topic no longer exists." };

  const content = {
    type: q.type,
    def: def.data,
    weight: q.weight,
    difficulty: q.difficulty,
    points: q.points,
    tags: q.tags,
    groupKey: q.groupKey,
  };

  return db.transaction(async (tx) => {
    if (!q.id) {
      const [row] = await tx
        .insert(questions)
        .values({ orgId: user.orgId, topicId: q.topicId, ...content, status: q.status, createdBy: user.id })
        .returning({ id: questions.id });
      await tx.insert(questionVersions).values({
        questionId: row.id,
        version: 1,
        ...content,
        conflictsWith: [],
        createdBy: user.id,
      });
      await writeAudit({ orgId: user.orgId, actorId: user.id, action: "question.create", entityType: "question", entityId: row.id, after: content }, tx);
      return { ok: true as const, id: row.id, version: 1 };
    }

    const [current] = await tx
      .select()
      .from(questions)
      .where(and(eq(questions.id, q.id), eq(questions.orgId, user.orgId)))
      .limit(1);
    if (!current) return { ok: false as const, error: "That question no longer exists." };
    if (current.type !== q.type) return { ok: false as const, error: "A question's type can't be changed." };

    const before = {
      type: current.type,
      def: current.def,
      weight: current.weight,
      difficulty: current.difficulty,
      points: current.points,
      tags: current.tags,
      groupKey: current.groupKey,
    };
    const changed = !isDeepStrictEqual(before, content);
    const version = changed ? current.version + 1 : current.version;

    await tx
      .update(questions)
      .set({ ...content, topicId: q.topicId, status: q.status, version })
      .where(eq(questions.id, current.id));
    if (changed) {
      await tx.insert(questionVersions).values({
        questionId: current.id,
        version,
        ...content,
        conflictsWith: current.conflictsWith,
        createdBy: user.id,
      });
      await writeAudit({ orgId: user.orgId, actorId: user.id, action: "question.update", entityType: "question", entityId: current.id, before, after: content }, tx);
    } else if (current.status !== q.status) {
      await writeAudit({ orgId: user.orgId, actorId: user.id, action: "question.status", entityType: "question", entityId: current.id, before: { status: current.status }, after: { status: q.status } }, tx);
    }
    return { ok: true as const, id: current.id, version };
  });
}

/** Make an old version current again by saving it as a new version (history is never rewritten). */
export async function restoreVersion(
  user: CurrentUser,
  questionId: string,
  version: number,
): Promise<ActionResult<{ version: number }>> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(questions)
      .where(and(eq(questions.id, questionId), eq(questions.orgId, user.orgId)))
      .limit(1);
    if (!current) return { ok: false as const, error: "That question no longer exists." };

    const [old] = await tx
      .select()
      .from(questionVersions)
      .where(and(eq(questionVersions.questionId, questionId), eq(questionVersions.version, version)))
      .limit(1);
    if (!old) return { ok: false as const, error: "That version doesn't exist." };

    const next = current.version + 1;
    const content = {
      type: old.type,
      def: old.def,
      weight: old.weight,
      difficulty: old.difficulty,
      points: old.points,
      tags: old.tags,
      groupKey: old.groupKey,
    };
    await tx.update(questions).set({ ...content, version: next }).where(eq(questions.id, questionId));
    await tx.insert(questionVersions).values({
      questionId,
      version: next,
      ...content,
      conflictsWith: old.conflictsWith,
      createdBy: user.id,
    });
    await writeAudit(
      { orgId: user.orgId, actorId: user.id, action: "question.restore", entityType: "question", entityId: questionId, before: { version: current.version }, after: { version: next, restoredFrom: version } },
      tx,
    );
    return { ok: true as const, version: next };
  });
}
