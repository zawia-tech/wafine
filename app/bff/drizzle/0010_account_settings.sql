ALTER TABLE "user_profiles" ADD COLUMN "display_name" text;
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_display_name_check" CHECK ("display_name" IS NULL OR char_length("display_name") BETWEEN 1 AND 80);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "closure_requested_at" timestamp with time zone;
