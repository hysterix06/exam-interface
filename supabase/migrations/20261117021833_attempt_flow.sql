ALTER TABLE "attempt_items" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD COLUMN "selection" jsonb;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "cursor" integer;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "late_window_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "late_penalty" jsonb;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "plan" jsonb;