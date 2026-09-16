ALTER TABLE "moderation_actions" ADD COLUMN "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL;
