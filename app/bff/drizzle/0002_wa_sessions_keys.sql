CREATE TABLE IF NOT EXISTS "wa_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "wa_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "wa_api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_sessions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"openwa_session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_sessions_openwa_session_id_unique" UNIQUE("openwa_session_id")
);
--> statement-breakpoint
ALTER TABLE "wa_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_api_keys" ADD CONSTRAINT "wa_api_keys_user_id_wa_sessions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."wa_sessions"("user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_sessions" ADD CONSTRAINT "wa_sessions_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
