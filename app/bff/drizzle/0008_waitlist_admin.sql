ALTER TABLE "waitlist" ADD COLUMN "invited_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "removed_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "waitlist_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waitlist_id" uuid NOT NULL,
	"admin_id" text NOT NULL,
	"action" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waitlist_events" ADD CONSTRAINT "waitlist_events_waitlist_id_waitlist_id_fk" FOREIGN KEY ("waitlist_id") REFERENCES "waitlist"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_waitlist_events_entry_created" ON "waitlist_events" USING btree ("waitlist_id", "created_at");
--> statement-breakpoint
ALTER TABLE "waitlist_events" ENABLE ROW LEVEL SECURITY;
