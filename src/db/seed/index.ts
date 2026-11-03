// Idempotent demo seed: `npm run db:seed`. Creates one account per role, a
// demo course, and a small question bank with a draft exam to try Phase 2 on.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Role } from "@/lib/auth/roles";
import { getQuestionType } from "@/question-types/registry";
import * as schema from "../schema";
import { DEMO_QUESTIONS, DEMO_TOPICS } from "./demo-content";
import { seedPracticeResults } from "./practice";

config({ path: ".env.local" });

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

const DEMO_USERS: { email: string; fullName: string; role: Role }[] = [
  { email: "admin@example.com", fullName: "Avery Admin", role: "admin" },
  { email: "instructor@example.com", fullName: "Ira Instructor", role: "instructor" },
  { email: "student@example.com", fullName: "Sam Student", role: "student" },
];

const DEMO_COURSE_ID = "00000000-0000-0000-0000-0000000000c1";

type SeedDb = ReturnType<typeof drizzle<typeof schema>>;

// Only seeds an empty bank, so re-running never duplicates or overwrites
// anything an author has since edited.
async function seedQuestionBank(db: SeedDb, authorId: string) {
  const [anyQuestion] = await db.select({ id: schema.questions.id }).from(schema.questions).limit(1);
  if (anyQuestion) {
    console.log("  questions  already present, left untouched");
    return;
  }

  const topicIds: Record<string, string> = {};
  for (const [position, name] of DEMO_TOPICS.entries()) {
    const [t] = await db
      .insert(schema.topics)
      .values({ courseId: DEMO_COURSE_ID, name, position })
      .returning({ id: schema.topics.id });
    topicIds[name] = t.id;
  }

  for (const q of DEMO_QUESTIONS) {
    const def = getQuestionType(q.type).defSchema.parse(q.def);
    const content = { type: q.type, def, weight: 1, difficulty: q.difficulty, points: 1, tags: [] as string[], groupKey: null };
    const [row] = await db
      .insert(schema.questions)
      .values({ topicId: topicIds[q.topic], ...content, status: "active", createdBy: authorId })
      .returning({ id: schema.questions.id });
    await db
      .insert(schema.questionVersions)
      .values({ questionId: row.id, version: 1, ...content, conflictsWith: [], createdBy: authorId });
  }

  await db.insert(schema.exams).values({
    courseId: DEMO_COURSE_ID,
    title: "BIO 101 Midterm (demo)",
    description: "A small exam drawn from three topics. Open it in the builder to see how it works.",
    blueprint: {
      sections: [
        { topicId: topicIds["Cell Biology"], count: 3 },
        { topicId: topicIds["Genetics"], count: 2 },
        { topicId: topicIds["Ecology"], count: 2 },
      ],
      shuffleQuestions: true,
    },
    settings: { timeLimitMinutes: 20, attemptsAllowed: 1, requireCode: false, oneWayNavigation: false, release: "explanations" },
    createdBy: authorId,
  });
  console.log(`  questions  ${DEMO_QUESTIONS.length} in ${DEMO_TOPICS.length} topics, plus a draft exam`);
}

const OPEN_EXAM_TITLE = "BIO 101 Quiz (open)";

// A published, open exam so the student flow can be tried right away. Locked to
// the current version of every active question, exactly as publishing does.
async function seedOpenExam(db: SeedDb, authorId: string) {
  const [already] = await db.select({ id: schema.exams.id }).from(schema.exams).where(eq(schema.exams.title, OPEN_EXAM_TITLE)).limit(1);
  if (already) return;

  const topics = await db.select().from(schema.topics).where(eq(schema.topics.courseId, DEMO_COURSE_ID));
  const byName = Object.fromEntries(topics.map((t) => [t.name, t.id]));
  if (!byName["Cell Biology"] || !byName["Genetics"]) return;

  const live = await db
    .select({ id: schema.questions.id, versionId: schema.questionVersions.id })
    .from(schema.questions)
    .innerJoin(
      schema.questionVersions,
      and(eq(schema.questionVersions.questionId, schema.questions.id), eq(schema.questionVersions.version, schema.questions.version)),
    )
    .where(and(eq(schema.questions.status, "active"), inArray(schema.questions.topicId, [byName["Cell Biology"], byName["Genetics"]])));

  await db.insert(schema.exams).values({
    courseId: DEMO_COURSE_ID,
    title: OPEN_EXAM_TITLE,
    description: "A short open quiz for trying the student experience.",
    blueprint: {
      sections: [
        { topicId: byName["Cell Biology"], count: 3 },
        { topicId: byName["Genetics"], count: 2 },
      ],
      shuffleQuestions: true,
    },
    settings: { timeLimitMinutes: 15, attemptsAllowed: 2, requireCode: false, oneWayNavigation: false, release: "explanations" },
    lockedVersions: Object.fromEntries(live.map((q) => [q.id, q.versionId])),
    state: "open",
    createdBy: authorId,
  });
  console.log(`  exam       ${OPEN_EXAM_TITLE}`);
}

async function main() {
  const password = env("SEED_PASSWORD");
  const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sql = postgres(env("DATABASE_URL"), { prepare: false, max: 1 });
  const db = drizzle(sql, { schema });

  const { data: existing, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) throw listError;

  const ids: Record<Role, string> = { admin: "", instructor: "", student: "" };
  for (const u of DEMO_USERS) {
    let id = existing.users.find((x) => x.email === u.email)?.id;
    if (id) {
      const { error } = await supabase.auth.admin.updateUserById(id, { password });
      if (error) throw error;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: u.fullName },
      });
      if (error) throw error;
      id = data.user.id;
    }
    // The on_auth_user_created trigger made the profile; promote it. The
    // on_profile_claims trigger mirrors the role into the JWT app_metadata.
    await db
      .update(schema.profiles)
      .set({ role: u.role, fullName: u.fullName })
      .where(eq(schema.profiles.id, id));
    ids[u.role] = id;
    console.log(`  ${u.role.padEnd(10)} ${u.email}`);
  }

  await db
    .insert(schema.courses)
    .values({ id: DEMO_COURSE_ID, code: "BIO 101", title: "Introduction to Biology" })
    .onConflictDoNothing();
  await db
    .insert(schema.enrollments)
    .values({ courseId: DEMO_COURSE_ID, userId: ids.student })
    .onConflictDoNothing();
  console.log("  course     BIO 101 (student enrolled)");

  await seedQuestionBank(db, ids.instructor);
  await seedOpenExam(db, ids.instructor);
  await seedPracticeResults(db, supabase, password, DEMO_COURSE_ID, ids.instructor);

  await sql.end();
}

console.log("Seeding…");
main().then(
  () => console.log("Done."),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
