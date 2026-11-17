// The second showcase: a "Field Skills" topic with one question of each type
// added later (categorize, chips, hotspot, label-the-diagram, drawing,
// uploaded workbook, front-desk widget, passage) plus wording variants and
// significant figures, and an open exam drawing all of them. Seed images and
// the starter workbook are generated and uploaded to Storage. Keyed on the
// topic name: runs once, also on databases seeded before it existed.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { joinDef, splitDef } from "@/engine/generate";
import { getQuestionType } from "@/question-types/registry";
import * as schema from "../schema";
import { FIELD_EXAM, FIELD_QUESTIONS, FIELD_SKILLS, SEED_IMAGE_PREFIX } from "./field-content";
import { fieldCountsWorkbook, SEED_PNGS } from "./images";

type Db = PostgresJsDatabase<typeof schema>;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Replace every { assetId: "seed:<name>" } with the uploaded asset's id. */
function withAssets(value: unknown, ids: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((v) => withAssets(v, ids));
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, withAssets(v, ids)]));
    if (typeof o.assetId === "string" && o.assetId.startsWith(SEED_IMAGE_PREFIX)) {
      const id = ids[o.assetId.slice(SEED_IMAGE_PREFIX.length)];
      if (!id) throw new Error(`No seed asset called ${o.assetId}`);
      out.assetId = id;
    }
    return out;
  }
  return value;
}

export async function seedField(db: Db, supabase: SupabaseClient, courseId: string, authorId: string) {
  const [existing] = await db
    .select({ id: schema.topics.id })
    .from(schema.topics)
    .where(and(eq(schema.topics.courseId, courseId), eq(schema.topics.name, FIELD_SKILLS)))
    .limit(1);
  const [course] = await db.select({ orgId: schema.courses.orgId }).from(schema.courses).where(eq(schema.courses.id, courseId)).limit(1);
  if (existing) return topUp(db, supabase, courseId, course.orgId, existing.id, authorId);

  const assetIds = await uploadSeedFiles(db, supabase, courseId, course.orgId, authorId);
  const position = (await db.select({ id: schema.topics.id }).from(schema.topics).where(eq(schema.topics.courseId, courseId))).length;
  const [topic] = await db.insert(schema.topics).values({ courseId, name: FIELD_SKILLS, position }).returning({ id: schema.topics.id });

  const locked: Record<string, string> = {};
  for (const q of FIELD_QUESTIONS) Object.assign(locked, await insertQuestion(db, topic.id, q, assetIds, authorId));

  await db.insert(schema.exams).values({
    courseId,
    title: FIELD_EXAM,
    description: "The newer question types in one exam: sorting into categories, drag-in chips, clicking and labelling a diagram, sketching a graph, uploading a real Excel workbook, a hotel front desk, and a passage with three parts.",
    blueprint: { sections: [{ topicId: topic.id, count: FIELD_QUESTIONS.length }], shuffleQuestions: false },
    settings: { timeLimitMinutes: 45, attemptsAllowed: 3, requireCode: false, oneWayNavigation: false, release: "explanations" },
    lockedVersions: locked,
    state: "open",
    createdBy: authorId,
  });
  console.log(`  field      ${FIELD_QUESTIONS.length} questions (newer types), ${Object.keys(assetIds).length} generated files, ${FIELD_EXAM}`);
}

async function uploadSeedFiles(db: Db, supabase: SupabaseClient, courseId: string, orgId: string, authorId: string) {
  // Upload the generated files and record them as course assets.
  const files: { name: string; bytes: Uint8Array; mime: string; fileName: string; width?: number; height?: number }[] = [
    ...Object.entries(SEED_PNGS).map(([name, draw]) => ({ name, bytes: draw(), mime: "image/png", fileName: `${name}.png`, width: 800, height: 600 })),
    { name: "field-counts", bytes: await fieldCountsWorkbook(), mime: XLSX, fileName: "field-counts.xlsx" },
  ];
  const assetIds: Record<string, string> = {};
  for (const f of files) {
    const sha256 = createHash("sha256").update(f.bytes).digest("hex");
    const path = `org/${orgId}/course/${courseId}/${sha256}.${f.mime === XLSX ? "xlsx" : "png"}`;
    const { error } = await supabase.storage.from("assets").upload(path, f.bytes, { contentType: f.mime, upsert: true });
    if (error) throw error;
    const [row] = await db
      .insert(schema.assets)
      .values({ orgId, courseId, kind: f.mime === XLSX ? "workbook" : "image", path, fileName: f.fileName, mime: f.mime, bytes: f.bytes.length, width: f.width ?? null, height: f.height ?? null, sha256, createdBy: authorId })
      .onConflictDoUpdate({ target: [schema.assets.courseId, schema.assets.sha256], set: { path } })
      .returning({ id: schema.assets.id });
    assetIds[f.name] = row.id;
  }

  return assetIds;
}

async function insertQuestion(db: Db, topicId: string, q: (typeof FIELD_QUESTIONS)[number], assetIds: Record<string, string>, authorId: string) {
  const { def, textVars } = splitDef(withAssets(q.def, assetIds));
  const stored = joinDef(getQuestionType(q.type).defSchema.parse(def), textVars);
  const content = { type: q.type, def: stored, weight: 1, difficulty: q.difficulty, points: q.points, tags: [] as string[], groupKey: null };
  const [row] = await db.insert(schema.questions).values({ topicId, ...content, status: "active", createdBy: authorId }).returning({ id: schema.questions.id });
  const [v] = await db.insert(schema.questionVersions).values({ questionId: row.id, version: 1, ...content, conflictsWith: [], createdBy: authorId }).returning({ id: schema.questionVersions.id });
  return { [row.id]: v.id };
}

/**
 * A database seeded before some field questions existed: add the missing types
 * to the topic and to the open field exam (demo content only; its attempts are
 * throwaway and the e2e setup clears them).
 */
async function topUp(db: Db, supabase: SupabaseClient, courseId: string, orgId: string, topicId: string, authorId: string) {
  const have = new Set((await db.select({ type: schema.questions.type }).from(schema.questions).where(eq(schema.questions.topicId, topicId))).map((r) => r.type));
  const missing = FIELD_QUESTIONS.filter((q) => !have.has(q.type));
  if (missing.length === 0) {
    console.log("  field      already present, left untouched");
    return;
  }
  const assetIds = await uploadSeedFiles(db, supabase, courseId, orgId, authorId);
  const added: Record<string, string> = {};
  for (const q of missing) Object.assign(added, await insertQuestion(db, topicId, q, assetIds, authorId));
  const [exam] = await db.select().from(schema.exams).where(and(eq(schema.exams.courseId, courseId), eq(schema.exams.title, FIELD_EXAM))).limit(1);
  if (exam) {
    const locked = { ...((exam.lockedVersions ?? {}) as Record<string, string>), ...added };
    await db.delete(schema.attempts).where(eq(schema.attempts.examId, exam.id));
    await db
      .update(schema.exams)
      .set({ lockedVersions: locked, blueprint: { sections: [{ topicId, count: Object.keys(locked).length }], shuffleQuestions: false } })
      .where(eq(schema.exams.id, exam.id));
  }
  console.log(`  field      added ${missing.map((q) => q.type).join(", ")} to ${FIELD_SKILLS}`);
}
