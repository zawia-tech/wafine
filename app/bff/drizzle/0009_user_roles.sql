ALTER TABLE "user_profiles" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_role_check" CHECK ("role" IN ('owner', 'admin', 'support', 'viewer', 'user'));
--> statement-breakpoint
CREATE TABLE "user_role_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"changed_by" text NOT NULL,
	"changed_by_email" text NOT NULL,
	"from_role" text NOT NULL CHECK ("from_role" IN ('owner', 'admin', 'support', 'viewer', 'user')),
	"to_role" text NOT NULL CHECK ("to_role" IN ('owner', 'admin', 'support', 'viewer', 'user')),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_role_events_user_created_idx" ON "user_role_events" USING btree ("user_id","created_at");
--> statement-breakpoint
ALTER TABLE "user_role_events" ENABLE ROW LEVEL SECURITY;
