CREATE TYPE "public"."comment_origin" AS ENUM('organic', 'ad', 'boosted');--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "origin" "comment_origin" DEFAULT 'organic' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "ad_external_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "creative_external_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "campaign_external_id" text;--> statement-breakpoint
CREATE INDEX "comments_org_origin_idx" ON "comments" USING btree ("organization_id","origin","created_at");