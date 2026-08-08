CREATE TYPE "public"."plaud_readiness" AS ENUM('discovered', 'awaiting_transcript', 'ready', 'ingested', 'stalled', 'superseded');--> statement-breakpoint
ALTER TYPE "public"."diarization_mode" ADD VALUE 'plaud';--> statement-breakpoint
ALTER TYPE "public"."event_source" ADD VALUE 'plaud';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plaud_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plaud_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"start_at" timestamp with time zone,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"serial_number" text,
	"readiness" "plaud_readiness" DEFAULT 'discovered' NOT NULL,
	"content_hash" text,
	"transcript_r2_key" text,
	"notes_r2_key" text,
	"event_id" uuid,
	"transcript_id" uuid,
	"meeting_id" uuid,
	"calendar_event_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ingested_at" timestamp with time zone,
	"stalled_alert_sent_at" timestamp with time zone,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plaud_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cursor" text,
	"last_polled_at" timestamp with time zone,
	"last_seen_created_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"adapter_mode" text DEFAULT 'http' NOT NULL,
	"last_command_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plaud_recordings_plaud_id_uq" ON "plaud_recordings" USING btree ("tenant_id","plaud_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plaud_recordings_readiness_idx" ON "plaud_recordings" USING btree ("tenant_id","readiness");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plaud_sync_state_tenant_uq" ON "plaud_sync_state" USING btree ("tenant_id");