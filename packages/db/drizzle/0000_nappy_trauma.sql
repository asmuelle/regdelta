CREATE TABLE "change_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"delta_id" text NOT NULL,
	"company_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"required_action" text NOT NULL,
	"affected_products" jsonb NOT NULL,
	"effective_date" text NOT NULL,
	"deadline" text,
	"materiality" text NOT NULL,
	"redline" jsonb NOT NULL,
	"claims" jsonb NOT NULL,
	"review_state" text NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"vertical" text NOT NULL,
	"products" jsonb NOT NULL,
	"jurisdictions" jsonb NOT NULL,
	"license_types" jsonb NOT NULL,
	"watch_terms" jsonb NOT NULL,
	"profile_embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "deltas" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"kind" text NOT NULL,
	"from_snapshot_id" text,
	"to_snapshot_id" text NOT NULL,
	"ops" jsonb NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"triage_state" text DEFAULT 'pending' NOT NULL,
	"triage_confidence" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"seq" bigint PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"prev_event_hash" text,
	"event_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"url" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"normalized_text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"adapter_id" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"agency" text NOT NULL,
	"feed_type" text NOT NULL,
	"url" text NOT NULL,
	"crawl_schedule" text NOT NULL,
	"freshness_sla_hours" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"tos_basis" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_cards" ADD CONSTRAINT "change_cards_delta_id_deltas_id_fk" FOREIGN KEY ("delta_id") REFERENCES "public"."deltas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_cards" ADD CONSTRAINT "change_cards_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deltas" ADD CONSTRAINT "deltas_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deltas" ADD CONSTRAINT "deltas_from_snapshot_id_snapshots_id_fk" FOREIGN KEY ("from_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deltas" ADD CONSTRAINT "deltas_to_snapshot_id_snapshots_id_fk" FOREIGN KEY ("to_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_hash_unique" ON "events" USING btree ("event_hash");--> statement-breakpoint
CREATE INDEX "snapshots_source_idx" ON "snapshots" USING btree ("source_id","fetched_at");