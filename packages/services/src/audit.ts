import { type Database, auditEvents } from "@social-ai/db";

export async function writeAudit(
  db: Database,
  input: {
    organizationId: string;
    actorType: "user" | "system" | "ai_policy";
    actorId?: string;
    eventType: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    organizationId: input.organizationId,
    actorType: input.actorType,
    actorId: input.actorId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    metadataJson: input.metadata ?? {},
  });
}
