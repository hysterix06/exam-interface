CREATE TYPE "public"."course_role" AS ENUM('teacher', 'student');--> statement-breakpoint
DROP INDEX "attempts_exam_idx";--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "role" "course_role" DEFAULT 'student' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "attempt_items_version_idx" ON "attempt_items" USING btree ("question_version_id");--> statement-breakpoint
CREATE INDEX "attempts_exam_user_idx" ON "attempts" USING btree ("exam_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_one_live_uq" ON "attempts" USING btree ("exam_id","user_id") WHERE "attempts"."state" = 'in_progress' and not "attempts"."is_preview";--> statement-breakpoint
CREATE INDEX "audit_log_org_ts_idx" ON "audit_log" USING btree ("org_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "courses_org_idx" ON "courses" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "enrollments_user_idx" ON "enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "exams_org_state_idx" ON "exams" USING btree ("org_id","state");--> statement-breakpoint
CREATE INDEX "extensions_exam_idx" ON "extensions" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "grades_needs_review_idx" ON "grades" USING btree ("attempt_item_id") WHERE "grades"."needs_review";--> statement-breakpoint
CREATE INDEX "profiles_org_idx" ON "profiles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "questions_org_status_idx" ON "questions" USING btree ("org_id","status");