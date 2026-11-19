import { type Database, knowledgeDocuments } from "@social-ai/db";
import type { ClientAccess, MembershipRole } from "@social-ai/domain";
import { roleAtLeast } from "@social-ai/domain";
import { and, desc, eq } from "drizzle-orm";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import { assertClientAllowed } from "./scopes";

const KINDS = ["faq", "tone", "protocol", "policy", "url", "note"] as const;
const STATUSES = ["draft", "active", "archived"] as const;

export async function listKnowledgeDocuments(
  db: Database,
  input: {
    organizationId: string;
    access: ClientAccess;
    clientId: string;
  },
) {
  assertClientAllowed(input.access, input.clientId);
  return db
    .select({
      id: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      kind: knowledgeDocuments.kind,
      body: knowledgeDocuments.body,
      sourceUrl: knowledgeDocuments.sourceUrl,
      status: knowledgeDocuments.status,
      authoritative: knowledgeDocuments.authoritative,
      updatedAt: knowledgeDocuments.updatedAt,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.organizationId, input.organizationId),
        eq(knowledgeDocuments.clientId, input.clientId),
      ),
    )
    .orderBy(desc(knowledgeDocuments.updatedAt));
}

export async function createKnowledgeDocument(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    role: MembershipRole;
    access: ClientAccess;
    clientId: string;
    title: string;
    kind: string;
    body?: string;
    sourceUrl?: string;
    authoritative?: boolean;
    status?: string;
  },
) {
  if (!roleAtLeast(input.role, "MANAGER")) {
    throw new AppError(403, "FORBIDDEN", "MANAGER+ can edit knowledge.");
  }
  assertClientAllowed(input.access, input.clientId);
  const title = input.title.trim();
  if (!title) {
    throw new AppError(400, "VALIDATION_ERROR", "Title is required.");
  }
  if (!(KINDS as readonly string[]).includes(input.kind)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid knowledge kind.");
  }
  const status = input.status ?? "active";
  if (!(STATUSES as readonly string[]).includes(status)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid status.");
  }

  const [created] = await db
    .insert(knowledgeDocuments)
    .values({
      organizationId: input.organizationId,
      clientId: input.clientId,
      title,
      kind: input.kind as (typeof KINDS)[number],
      body: input.body?.trim() ?? "",
      sourceUrl: input.sourceUrl?.trim() || null,
      authoritative: Boolean(input.authoritative),
      status: status as (typeof STATUSES)[number],
      createdByUserId: input.actorId,
    })
    .returning();

  if (!created) {
    throw new AppError(500, "KNOWLEDGE_CREATE_FAILED", "Could not create doc.");
  }

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "knowledge.created",
    entityType: "knowledge_document",
    entityId: created.id,
  });

  return created;
}

export async function updateKnowledgeDocument(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    role: MembershipRole;
    access: ClientAccess;
    documentId: string;
    title?: string;
    body?: string;
    status?: string;
    authoritative?: boolean;
  },
) {
  if (!roleAtLeast(input.role, "MANAGER")) {
    throw new AppError(403, "FORBIDDEN", "MANAGER+ can edit knowledge.");
  }

  const [existing] = await db
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.id, input.documentId),
        eq(knowledgeDocuments.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new AppError(404, "KNOWLEDGE_NOT_FOUND", "Document not found.");
  }
  assertClientAllowed(input.access, existing.clientId);

  if (input.status && !(STATUSES as readonly string[]).includes(input.status)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid status.");
  }

  const [updated] = await db
    .update(knowledgeDocuments)
    .set({
      title: input.title?.trim() ?? existing.title,
      body: input.body ?? existing.body,
      status: (input.status as (typeof STATUSES)[number]) ?? existing.status,
      authoritative:
        input.authoritative === undefined
          ? existing.authoritative
          : input.authoritative,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeDocuments.id, existing.id))
    .returning();

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "knowledge.updated",
    entityType: "knowledge_document",
    entityId: existing.id,
  });

  return updated;
}
