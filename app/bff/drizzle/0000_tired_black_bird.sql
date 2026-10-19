CREATE TABLE IF NOT EXISTS "audit_log" (
	"audit_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"success" integer NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"contact_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone_blind_index" "bytea",
	"jid_blind_index" "bytea" NOT NULL,
	"name_ciphertext" "bytea",
	"name_wrapped_dek" "bytea",
	"name_dek_nonce" "bytea",
	"name_dek_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "devices" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"wrapped_kek" "bytea" NOT NULL,
	"device_public_key" "bytea" NOT NULL,
	"device_name" text,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "key_rotation_jobs" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key_type" text NOT NULL,
	"old_version" integer NOT NULL,
	"new_version" integer NOT NULL,
	"cursor_position" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_objects" (
	"media_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"message_id" uuid,
	"r2_object_key" text NOT NULL,
	"ciphertext_size" bigint NOT NULL,
	"wrapped_dek" "bytea" NOT NULL,
	"dek_nonce" "bytea" NOT NULL,
	"dek_version" integer DEFAULT 1 NOT NULL,
	"secretstream_header" "bytea",
	"mime_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sender_ref" text NOT NULL,
	"recipient_ref" text NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"wrapped_dek" "bytea" NOT NULL,
	"dek_nonce" "bytea" NOT NULL,
	"dek_version" integer DEFAULT 1 NOT NULL,
	"alg_id" text DEFAULT 'xchacha20poly1305' NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_keys" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"wrapped_kek" "bytea" NOT NULL,
	"kek_nonce" "bytea" NOT NULL,
	"kek_version" integer DEFAULT 1 NOT NULL,
	"alg_id" text DEFAULT 'xchacha20poly1305' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_themes" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"primary_color" text DEFAULT '#1a73e8' NOT NULL,
	"font_family" text DEFAULT 'Inter' NOT NULL,
	"custom_css" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_themes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_recovery" (
	"recovery_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"wrapped_urk" "bytea" NOT NULL,
	"recovery_nonce" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "devices" ADD CONSTRAINT "devices_tenant_id_tenant_keys_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_keys"("tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_tenant_created" ON "audit_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_tenant_phone" ON "contacts" USING btree ("tenant_id","phone_blind_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_tenant_jid" ON "contacts" USING btree ("tenant_id","jid_blind_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_tenant_sent" ON "messages" USING btree ("tenant_id","sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_sender" ON "messages" USING btree ("sender_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_recipient" ON "messages" USING btree ("recipient_ref");