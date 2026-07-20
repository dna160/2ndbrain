CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"clerk_user_id" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"external_id" text,
	"sync_cursor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"wa_id" text NOT NULL,
	"label" text,
	"blocked" boolean DEFAULT false NOT NULL,
	"bot_active_until" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" "event_source" NOT NULL,
	"type" "event_type" NOT NULL,
	"direction" "event_direction" DEFAULT 'inbound' NOT NULL,
	"external_id" text,
	"sender_wa_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"content" text,
	"raw" jsonb NOT NULL,
	"media_asset_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"duration_sec" real,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transcript_id" uuid NOT NULL,
	"calendar_event_id" uuid,
	"title" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"duration_sec" real,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attribution_confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"owner_entity_id" uuid,
	"due_at" timestamp with time zone,
	"source_event_id" uuid,
	"meeting_id" uuid,
	"normalized_lang" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"status" "transcript_status" DEFAULT 'pending' NOT NULL,
	"language" text,
	"language_confidence" real,
	"stt_provider" text,
	"diarization_mode" "diarization_mode" DEFAULT 'none' NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"content" text NOT NULL,
	"position" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "entity_kind" NOT NULL,
	"name" text NOT NULL,
	"aka" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"salience" real DEFAULT 0.5 NOT NULL,
	"sensitivity" "sensitivity" DEFAULT 'normal' NOT NULL,
	"is_core" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"relation" "relation_type" NOT NULL,
	"strength" real DEFAULT 0.5 NOT NULL,
	"provenance_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"content" text NOT NULL,
	"entity_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" vector(1024),
	"confidence" real DEFAULT 0.5 NOT NULL,
	"salience" real DEFAULT 0.5 NOT NULL,
	"sensitivity" "sensitivity" DEFAULT 'normal' NOT NULL,
	"status" "memory_status" DEFAULT 'active' NOT NULL,
	"provenance_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"reason" "memory_review_reason" NOT NULL,
	"resolution" "memory_review_resolution",
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"action" "calendar_draft_action" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "calendar_draft_status" DEFAULT 'proposed' NOT NULL,
	"source_type" "calendar_draft_source" NOT NULL,
	"source_id" uuid,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gcal_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"title" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb NOT NULL,
	"brief_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"content" jsonb NOT NULL,
	"delivered_via" "digest_delivered_via" DEFAULT 'none' NOT NULL,
	"window_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dlq" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"queue" text NOT NULL,
	"job_id" text,
	"payload" jsonb,
	"error" jsonb,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"status" "pipeline_status" DEFAULT 'running' NOT NULL,
	"stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stt_seconds" real DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_idr" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meetings" ADD CONSTRAINT "meetings_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meetings" ADD CONSTRAINT "meetings_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_entity_id_entities_id_fk" FOREIGN KEY ("owner_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_event_id_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_from_id_entities_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_to_id_entities_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memory_reviews" ADD CONSTRAINT "memory_reviews_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connected_accounts_tenant_id_idx" ON "connected_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_clerk_user_id_uq" ON "users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_tenant_id_idx" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_contacts_wa_id_uq" ON "wa_contacts" USING btree ("wa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_contacts_tenant_id_idx" ON "wa_contacts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "events_external_id_uq" ON "events" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_tenant_id_idx" ON "events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_sender_wa_id_idx" ON "events" USING btree ("tenant_id","sender_wa_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_occurred_at_idx" ON "events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_assets_tenant_id_idx" ON "media_assets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_assets_sha256_idx" ON "media_assets" USING btree ("tenant_id","sha256");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_tenant_id_idx" ON "meetings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_occurred_at_idx" ON "meetings" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_tenant_id_idx" ON "tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcripts_tenant_id_idx" ON "transcripts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcripts_event_id_idx" ON "transcripts" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "core_memories_tenant_id_position_idx" ON "core_memories" USING btree ("tenant_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entities_tenant_id_idx" ON "entities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entities_kind_idx" ON "entities" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entity_links_from_to_relation_uq" ON "entity_links" USING btree ("from_id","to_id","relation");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_links_tenant_id_idx" ON "entity_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_links_from_idx" ON "entity_links" USING btree ("from_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_links_to_idx" ON "entity_links" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_tenant_id_idx" ON "memories" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_status_idx" ON "memories" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_embedding_idx" ON "memories" USING ivfflat ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_reviews_tenant_id_idx" ON "memory_reviews" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_reviews_unresolved_idx" ON "memory_reviews" USING btree ("tenant_id","resolved_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_drafts_tenant_id_idx" ON "calendar_drafts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_drafts_status_idx" ON "calendar_drafts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_events_gcal_id_uq" ON "calendar_events" USING btree ("gcal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_tenant_id_idx" ON "calendar_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_start_at_idx" ON "calendar_events" USING btree ("tenant_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "digests_tenant_date_uq" ON "digests" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dlq_tenant_id_idx" ON "dlq" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dlq_queue_idx" ON "dlq" USING btree ("queue");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runs_tenant_id_idx" ON "pipeline_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runs_status_idx" ON "pipeline_runs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runs_job_type_idx" ON "pipeline_runs" USING btree ("tenant_id","job_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runs_ref_idx" ON "pipeline_runs" USING btree ("ref_type","ref_id");