ALTER TABLE "attempt_items" ADD COLUMN "seed_version_id" uuid;--> statement-breakpoint
-- Backfill. A regrade used to overwrite question_version_id, so for live
-- attempts of a published exam the original version is the one the exam
-- locked at publish (locked_versions: question id -> version id). Everything
-- else (previews, unregraded items) was seeded from question_version_id.
UPDATE "attempt_items" ai
SET "seed_version_id" = COALESCE(
  (
    SELECT (e."locked_versions" ->> qv."question_id"::text)::uuid
    FROM "attempts" a
    JOIN "exams" e ON e."id" = a."exam_id"
    JOIN "question_versions" qv ON qv."id" = ai."question_version_id"
    WHERE a."id" = ai."attempt_id" AND a."is_preview" = false AND e."locked_versions" IS NOT NULL
  ),
  ai."question_version_id"
);--> statement-breakpoint
ALTER TABLE "attempt_items" ALTER COLUMN "seed_version_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_seed_version_id_question_versions_id_fk" FOREIGN KEY ("seed_version_id") REFERENCES "public"."question_versions"("id") ON DELETE no action ON UPDATE no action;
