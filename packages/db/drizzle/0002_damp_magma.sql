CREATE TYPE "public"."case_kind" AS ENUM('none', 'attention', 'complaint', 'scam');--> statement-breakpoint
CREATE TYPE "public"."content_piece_status" AS ENUM('draft', 'internal_review', 'client_review', 'changes_requested', 'approved');--> statement-breakpoint
CREATE TYPE "public"."urgency" AS ENUM('GREEN', 'YELLOW', 'RED');--> statement-breakpoint
CREATE TABLE "content_piece_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"content_piece_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"copy_text" text DEFAULT '' NOT NULL,
	"notes_internal" text DEFAULT '' NOT NULL,
	"notes_client" text DEFAULT '' NOT NULL,
	"media_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_piece_versions_piece_version" UNIQUE("content_piece_id","version")
);
--> statement-breakpoint
CREATE TABLE "content_pieces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"brand_id" uuid,
	"title" text NOT NULL,
	"status" "content_piece_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"timezone" text DEFAULT 'America/Guatemala' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "month_share_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"month_share_link_id" uuid NOT NULL,
	"content_piece_id" uuid,
	"guest_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "month_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"year_month" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "month_share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "urgency" "urgency" DEFAULT 'GREEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "urgency_override" "urgency";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "urgency_reason" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "case_kind" "case_kind" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "assigned_user_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "attention_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "client_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "content_piece_versions" ADD CONSTRAINT "content_piece_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_piece_versions" ADD CONSTRAINT "content_piece_versions_content_piece_id_content_pieces_id_fk" FOREIGN KEY ("content_piece_id") REFERENCES "public"."content_pieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_piece_versions" ADD CONSTRAINT "content_piece_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_share_feedback" ADD CONSTRAINT "month_share_feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_share_feedback" ADD CONSTRAINT "month_share_feedback_month_share_link_id_month_share_links_id_fk" FOREIGN KEY ("month_share_link_id") REFERENCES "public"."month_share_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_share_feedback" ADD CONSTRAINT "month_share_feedback_content_piece_id_content_pieces_id_fk" FOREIGN KEY ("content_piece_id") REFERENCES "public"."content_pieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_share_links" ADD CONSTRAINT "month_share_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_share_links" ADD CONSTRAINT "month_share_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_share_links" ADD CONSTRAINT "month_share_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_pieces_org_client_scheduled_idx" ON "content_pieces" USING btree ("organization_id","client_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "content_pieces_org_status_idx" ON "content_pieces" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "month_share_links_org_client_idx" ON "month_share_links" USING btree ("organization_id","client_id","year_month");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_org_urgency_idx" ON "comments" USING btree ("organization_id","urgency","created_at");