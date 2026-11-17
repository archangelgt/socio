CREATE TYPE "public"."publish_destination_status" AS ENUM('scheduled', 'publishing', 'published', 'failed', 'needs_mobile');--> statement-breakpoint
CREATE TABLE "content_piece_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"content_piece_id" uuid NOT NULL,
	"content_piece_version" integer DEFAULT 1 NOT NULL,
	"social_account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" "publish_destination_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"timezone" text DEFAULT 'America/Guatemala' NOT NULL,
	"external_post_id" text,
	"permalink" text,
	"last_error" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_piece_destinations_piece_account" UNIQUE("content_piece_id","social_account_id")
);
--> statement-breakpoint
ALTER TABLE "content_piece_destinations" ADD CONSTRAINT "content_piece_destinations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_piece_destinations" ADD CONSTRAINT "content_piece_destinations_content_piece_id_content_pieces_id_fk" FOREIGN KEY ("content_piece_id") REFERENCES "public"."content_pieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_piece_destinations" ADD CONSTRAINT "content_piece_destinations_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_piece_destinations_due_idx" ON "content_piece_destinations" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "content_piece_destinations_org_piece_idx" ON "content_piece_destinations" USING btree ("organization_id","content_piece_id");