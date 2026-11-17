CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_org_slug" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_org_idx" ON "clients" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "client_id" uuid;--> statement-breakpoint
INSERT INTO "clients" ("organization_id", "name", "slug", "status")
SELECT "id", 'Default', 'default', 'active'
FROM "organizations"
WHERE NOT EXISTS (
	SELECT 1 FROM "clients"
	WHERE "clients"."organization_id" = "organizations"."id"
	AND "clients"."slug" = 'default'
);--> statement-breakpoint
UPDATE "brands"
SET "client_id" = "clients"."id"
FROM "clients"
WHERE "clients"."organization_id" = "brands"."organization_id"
AND "clients"."slug" = 'default'
AND "brands"."client_id" IS NULL;--> statement-breakpoint
ALTER TABLE "brands" ALTER COLUMN "client_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brands_client_idx" ON "brands" USING btree ("client_id");--> statement-breakpoint
CREATE TABLE "membership_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"brand_id" uuid,
	"social_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_scopes_membership_client" UNIQUE("membership_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "membership_scopes" ADD CONSTRAINT "membership_scopes_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_scopes" ADD CONSTRAINT "membership_scopes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_scopes" ADD CONSTRAINT "membership_scopes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_scopes" ADD CONSTRAINT "membership_scopes_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_scopes" ADD CONSTRAINT "membership_scopes_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_scopes_membership_idx" ON "membership_scopes" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "membership_scopes_org_idx" ON "membership_scopes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "membership_scopes_client_idx" ON "membership_scopes" USING btree ("client_id");
