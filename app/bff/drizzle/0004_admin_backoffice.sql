CREATE TABLE IF NOT EXISTS "bff_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bff_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_session_limits" (
	"openwa_session_id" uuid PRIMARY KEY NOT NULL,
	"per_day" integer,
	"per_minute" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wa_session_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_session_limits" ADD CONSTRAINT "wa_session_limits_openwa_session_id_wa_sessions_openwa_session_id_fk" FOREIGN KEY ("openwa_session_id") REFERENCES "public"."wa_sessions"("openwa_session_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
