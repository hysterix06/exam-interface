import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

// Single-tenant for v1; every top-level table carries org_id so multi-org is a
// data change later, not a migration. Child rows (attempt_items, responses,
// grades, events) inherit their org through their parent.
export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export const userRole = pgEnum("user_role", ["admin", "instructor", "student"]);
export const examState = pgEnum("exam_state", [
  "draft",
  "scheduled",
  "open",
  "closed",
  "graded",
  "released",
]);
export const attemptState = pgEnum("attempt_state", [
  "in_progress",
  "submitted",
  "graded",
]);
export const questionStatus = pgEnum("question_status", [
  "draft",
  "active",
  "archived",
]);
export const gradedBy = pgEnum("graded_by", ["auto", "user"]);
export const extensionKind = pgEnum("extension_kind", ["multiplier", "minutes"]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const orgId = () =>
  uuid("org_id")
    .notNull()
    .default(DEFAULT_ORG_ID)
    .references(() => orgs.id);

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

// 1:1 with auth.users. Rows are created by the on_auth_user_created trigger;
// role/org are mirrored into auth.users.raw_app_meta_data for JWT claims.
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  orgId: orgId(),
  role: userRole("role").notNull().default("student"),
  email: text("email").notNull(),
  fullName: text("full_name"),
  createdAt: createdAt(),
});

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: orgId(),
  code: text("code"),
  title: text("title").notNull(),
  createdAt: createdAt(),
});

export const enrollments = pgTable(
  "enrollments",
  {
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.userId] })],
);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("topics_course_idx").on(t.courseId)],
);

// The editable working copy of a question. Every save also writes an immutable
// question_versions row; exams and attempts only ever reference versions.
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id),
    type: text("type").notNull(),
    def: jsonb("def").notNull(),
    weight: doublePrecision("weight").notNull().default(1),
    difficulty: integer("difficulty").notNull().default(2),
    points: doublePrecision("points").notNull().default(1),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // Variant group: at most one question per group is drawn into an exam.
    groupKey: text("group_key"),
    conflictsWith: uuid("conflicts_with").array().notNull().default(sql`'{}'::uuid[]`),
    version: integer("version").notNull().default(1),
    status: questionStatus("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("questions_topic_idx").on(t.topicId)],
);

export const questionVersions = pgTable(
  "question_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    version: integer("version").notNull(),
    type: text("type").notNull(),
    def: jsonb("def").notNull(),
    weight: doublePrecision("weight").notNull(),
    difficulty: integer("difficulty").notNull(),
    points: doublePrecision("points").notNull(),
    tags: text("tags").array().notNull(),
    groupKey: text("group_key"),
    conflictsWith: uuid("conflicts_with").array().notNull(),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [unique("question_versions_question_version_uq").on(t.questionId, t.version)],
);

export const exams = pgTable(
  "exams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    title: text("title").notNull(),
    description: text("description"),
    settings: jsonb("settings").notNull().default({}),
    blueprint: jsonb("blueprint").notNull().default({}),
    // Set at publish: question id -> question_versions.id used by this exam.
    lockedVersions: jsonb("locked_versions"),
    state: examState("state").notNull().default("draft"),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("exams_course_idx").on(t.courseId)],
);

export const examCodes = pgTable(
  "exam_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    assignedUserId: uuid("assigned_user_id").references(() => profiles.id),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("exam_codes_exam_idx").on(t.examId)],
);

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    seed: text("seed").notNull(),
    // Author "take it as a student" runs; excluded from results and analytics.
    isPreview: boolean("is_preview").notNull().default(false),
    state: attemptState("state").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    score: doublePrecision("score"),
    maxScore: doublePrecision("max_score"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("attempts_exam_idx").on(t.examId),
    index("attempts_user_idx").on(t.userId),
  ],
);

// The frozen, generated instance a student actually saw. Grading reads only this.
export const attemptItems = pgTable(
  "attempt_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionVersionId: uuid("question_version_id")
      .notNull()
      .references(() => questionVersions.id),
    position: integer("position").notNull(),
    instance: jsonb("instance").notNull(),
    flagged: boolean("flagged").notNull().default(false),
  },
  (t) => [unique("attempt_items_attempt_position_uq").on(t.attemptId, t.position)],
);

export const responses = pgTable("responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptItemId: uuid("attempt_item_id")
    .notNull()
    .unique()
    .references(() => attemptItems.id, { onDelete: "cascade" }),
  response: jsonb("response"),
  // Client sequence number; a save with a lower seq than stored is ignored.
  seq: integer("seq").notNull().default(0),
  updatedAt: updatedAt(),
});

export const grades = pgTable("grades", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptItemId: uuid("attempt_item_id")
    .notNull()
    .unique()
    .references(() => attemptItems.id, { onDelete: "cascade" }),
  score: doublePrecision("score").notNull(),
  max: doublePrecision("max").notNull(),
  // Plain-language explanation: GradeLine[] from the question type's grader.
  lines: jsonb("lines").notNull().default([]),
  gradedBy: gradedBy("graded_by").notNull().default("auto"),
  graderId: uuid("grader_id").references(() => profiles.id),
  needsReview: boolean("needs_review").notNull().default(false),
  overrideReason: text("override_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Integrity signals (blur, paste, reconnect, idle). Logged, never enforced.
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_attempt_idx").on(t.attemptId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: orgId(),
    actorId: uuid("actor_id").references(() => profiles.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId)],
);

// Accommodations. exam_id null = applies to every exam for this student.
export const extensions = pgTable(
  "extensions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    examId: uuid("exam_id").references(() => exams.id),
    kind: extensionKind("kind").notNull(),
    value: doublePrecision("value").notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [index("extensions_user_idx").on(t.userId)],
);
