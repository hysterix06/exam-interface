import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
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
  uniqueIndex,
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
// A person's part in one course. Instructors only see courses they teach.
export const courseRole = pgEnum("course_role", ["teacher", "student"]);
export const assignmentState = pgEnum("assignment_state", ["draft", "published"]);
export const courseEventKind = pgEnum("course_event_kind", ["class", "deadline", "holiday", "other"]);
export const apiTokenKind = pgEnum("api_token_kind", ["api", "calendar"]);

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
  // OrgSettings (src/server/admin/org.ts): defaults for new exams.
  settings: jsonb("settings").notNull().default({}),
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
  // Deactivated people can't sign in; their attempts and history stay.
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("profiles_org_idx").on(t.orgId)]);

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: orgId(),
  code: text("code"),
  title: text("title").notNull(),
  // The course homepage: a short blurb, the syllabus (Markdown, rendered by
  // Prose) and practical details (CourseInfo, src/engine/course.ts).
  description: text("description"),
  syllabus: text("syllabus"),
  term: text("term"),
  startsOn: date("starts_on", { mode: "string" }),
  endsOn: date("ends_on", { mode: "string" }),
  info: jsonb("info").notNull().default({}),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("courses_org_idx").on(t.orgId)]);

export const enrollments = pgTable(
  "enrollments",
  {
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: courseRole("role").notNull().default("student"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.userId] }), index("enrollments_user_idx").on(t.userId)],
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
  (t) => [index("questions_topic_idx").on(t.topicId), index("questions_org_status_idx").on(t.orgId, t.status)],
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
    // Where this exam counts in the course grade (null = not counted).
    categoryId: uuid("category_id").references(() => gradeCategories.id, { onDelete: "set null" }),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("exams_course_idx").on(t.courseId), index("exams_org_state_idx").on(t.orgId, t.state)],
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
    // Sequential attempts (one-way, per-question time limits, adaptive): the
    // position the student is on. The server only hands out items up to it and
    // only accepts saves to it. Null = free navigation.
    cursor: integer("cursor"),
    // Minutes past deadline_at the attempt stays open under the exam's late policy.
    lateWindowMinutes: integer("late_window_minutes").notNull().default(0),
    // The deduction applied for submitting late (LatePenalty), or null.
    latePenalty: jsonb("late_penalty"),
    // Last save, at most every 20 s: drives "last seen" and Realtime on the live board.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    // Adaptive attempts: the rules and item difficulties frozen at start, so the
    // path can be replayed exactly even if the exam is recalibrated later.
    plan: jsonb("plan"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("attempts_exam_user_idx").on(t.examId, t.userId),
    index("attempts_user_idx").on(t.userId),
    // One live attempt per student per exam; a double-click start resumes instead.
    uniqueIndex("attempts_one_live_uq")
      .on(t.examId, t.userId)
      .where(sql`${t.state} = 'in_progress' and not ${t.isPreview}`),
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
    // The version this item was drawn and seeded from. Never changes: a regrade
    // moves questionVersionId to the new version but the student's variables and
    // option order still come from hash(attempt.seed + ":" + seedVersionId).
    seedVersionId: uuid("seed_version_id")
      .notNull()
      .references(() => questionVersions.id),
    position: integer("position").notNull(),
    instance: jsonb("instance").notNull(),
    flagged: boolean("flagged").notNull().default(false),
    // When the student first reached it (sequential attempts, time per question).
    openedAt: timestamp("opened_at", { withTimezone: true }),
    // When it stopped taking answers (moved on, or its own time ran out).
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    // Adaptive attempts: why this item was picked at this step (the trace shown to staff).
    selection: jsonb("selection"),
  },
  (t) => [
    unique("attempt_items_attempt_position_uq").on(t.attemptId, t.position),
    index("attempt_items_version_idx").on(t.questionVersionId),
  ],
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
}, (t) => [index("grades_needs_review_idx").on(t.attemptItemId).where(sql`${t.needsReview}`)]);

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
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_org_ts_idx").on(t.orgId, t.ts.desc()),
  ],
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
  (t) => [index("extensions_user_idx").on(t.userId), index("extensions_exam_idx").on(t.examId)],
);

// Uploaded files (images for hotspot/diagram/passage questions, starter
// workbooks). The bytes live in a private Supabase Storage bucket; questions
// refer to an asset by id, never by URL, so generated instances stay
// deterministic and access is checked on every request (/assets/[id]).
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    /** image | workbook */
    kind: text("kind").notNull(),
    /** Path inside the bucket. */
    path: text("path").notNull(),
    fileName: text("file_name").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").notNull(),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [index("assets_course_idx").on(t.courseId), uniqueIndex("assets_course_sha_uq").on(t.courseId, t.sha256)],
);

// A slice of the course grade ("Exams 50%"). Exams and assignments each belong
// to at most one category; courseGrade() (src/engine/gradebook) does the maths.
export const gradeCategories = pgTable(
  "grade_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Percent of the course grade. */
    weight: doublePrecision("weight").notNull(),
    /** Lowest N items in this category are left out. */
    dropLowest: integer("drop_lowest").notNull().default(0),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("grade_categories_course_idx").on(t.courseId)],
);

// Teacher-added calendar entries (lectures, holidays, reminders). Exams and
// assignments appear on the calendar from their own dates.
export const courseEvents = pgTable(
  "course_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: courseEventKind("kind").notNull().default("other"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    description: text("description"),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [index("course_events_course_starts_idx").on(t.courseId, t.startsAt)],
);

// Homework: instructions, a due date, a text and/or file submission, marked by
// a person against a rubric. Not an exam: no questions, seeds or attempts.
export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    categoryId: uuid("category_id").references(() => gradeCategories.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    instructions: text("instructions"),
    state: assignmentState("state").notNull().default("draft"),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    points: doublePrecision("points").notNull().default(10),
    // AssignmentSettings (src/engine/assignments/settings.ts).
    settings: jsonb("settings").notNull().default({}),
    // RubricCriterion[] (src/engine/assignments/rubric.ts).
    rubric: jsonb("rubric").notNull().default([]),
    // Grades are visible to students from this moment.
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("assignments_course_idx").on(t.courseId)],
);

// One row per hand-in. Resubmitting adds a version; the highest version counts.
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    version: integer("version").notNull().default(1),
    text: text("text"),
    // SubmissionFile[]: bytes live in the private submissions bucket.
    files: jsonb("files").notNull().default([]),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    /** Whole minutes past the (extended) due date when it was handed in. */
    lateMinutes: integer("late_minutes").notNull().default(0),
  },
  (t) => [
    unique("submissions_assignment_user_version_uq").on(t.assignmentId, t.userId, t.version),
    index("submissions_user_idx").on(t.userId),
  ],
);

export const submissionGrades = pgTable("submission_grades", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id")
    .notNull()
    .unique()
    .references(() => submissions.id, { onDelete: "cascade" }),
  score: doublePrecision("score").notNull(),
  max: doublePrecision("max").notNull(),
  // GradeLine[]: rubric lines, late deduction and any adjustment; they sum to score.
  lines: jsonb("lines").notNull().default([]),
  ticked: text("ticked").array().notNull().default(sql`'{}'::text[]`),
  feedback: text("feedback"),
  latePenalty: jsonb("late_penalty"),
  // Excused work is left out of the course grade.
  excused: boolean("excused").notNull().default(false),
  overrideReason: text("override_reason"),
  graderId: uuid("grader_id").references(() => profiles.id),
  gradedAt: timestamp("graded_at", { withTimezone: true }).notNull().defaultNow(),
});

// A later due date for one student on one assignment.
export const assignmentExtensions = pgTable(
  "assignment_extensions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("assignment_extensions_uq").on(t.assignmentId, t.userId)],
);

// Personal access: read-only API tokens and private calendar feed URLs. Only a
// sha256 of the secret is stored; the secret is shown once.
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: apiTokenKind("kind").notNull().default("api"),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** First characters of the secret, so people can tell tokens apart. */
    prefix: text("prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);
