ALTER TABLE "profiles" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "phone_region" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_phone_e164" CHECK ("profiles"."phone" ~ '^[+][1-9][0-9]{1,14}$');--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_phone_region_iso" CHECK ("profiles"."phone_region" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_phone_pair" CHECK (("profiles"."phone" IS NULL) = ("profiles"."phone_region" IS NULL));