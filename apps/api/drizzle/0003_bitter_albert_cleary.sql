CREATE TABLE IF NOT EXISTS "speaker_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"device_serial" text NOT NULL,
	"speaker_label" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_via" text DEFAULT 'dashboard' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "speaker_aliases_key_uq" ON "speaker_aliases" USING btree ("tenant_id","device_serial","speaker_label");