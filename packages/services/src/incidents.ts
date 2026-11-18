import {
  type Database,
  clients,
  incidentEvidence,
  incidents,
} from "@social-ai/db";
import type { ClientAccess, MembershipRole, Severity } from "@social-ai/domain";
import { SEVERITIES, roleAtLeast } from "@social-ai/domain";
import { and, desc, eq } from "drizzle-orm";
import { writeAudit } from "./audit";
import { setClientCrisisMode } from "./clients";
import { AppError } from "./errors";
import { assertClientAllowed } from "./scopes";

const STATUSES = ["open", "monitoring", "resolved", "closed"] as const;

export async function listIncidents(
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
      id: incidents.id,
      title: incidents.title,
      summary: incidents.summary,
      status: incidents.status,
      severity: incidents.severity,
      evidenceObserved: incidents.evidenceObserved,
      coordinationSuspected: incidents.coordinationSuspected,
      crisisEnabled: incidents.crisisEnabled,
      createdAt: incidents.createdAt,
      resolvedAt: incidents.resolvedAt,
    })
    .from(incidents)
    .where(
      and(
        eq(incidents.organizationId, input.organizationId),
        eq(incidents.clientId, input.clientId),
      ),
    )
    .orderBy(desc(incidents.createdAt));
}

export async function createIncident(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    role: MembershipRole;
    access: ClientAccess;
    clientId: string;
    title: string;
    summary?: string;
    severity?: string;
    evidenceObserved?: boolean;
    coordinationSuspected?: boolean;
    enableCrisis?: boolean;
  },
) {
  if (!roleAtLeast(input.role, "MODERATOR")) {
    throw new AppError(403, "FORBIDDEN", "MODERATOR+ can open incidents.");
  }
  assertClientAllowed(input.access, input.clientId);
  const title = input.title.trim();
  if (!title) {
    throw new AppError(400, "VALIDATION_ERROR", "Title is required.");
  }
  const severity = (input.severity ?? "MEDIUM") as Severity;
  if (!(SEVERITIES as readonly string[]).includes(severity)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid severity.");
  }

  const [created] = await db
    .insert(incidents)
    .values({
      organizationId: input.organizationId,
      clientId: input.clientId,
      title,
      summary: input.summary?.trim() ?? "",
      severity,
      evidenceObserved: Boolean(input.evidenceObserved),
      coordinationSuspected: Boolean(input.coordinationSuspected),
      crisisEnabled: Boolean(input.enableCrisis),
      openedByUserId: input.actorId,
      assignedUserId: input.actorId,
    })
    .returning();

  if (!created) {
    throw new AppError(
      500,
      "INCIDENT_CREATE_FAILED",
      "Could not open incident.",
    );
  }

  if (input.enableCrisis) {
    if (!roleAtLeast(input.role, "ADMIN")) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only OWNER or ADMIN can enable crisis mode with an incident.",
      );
    }
    await setClientCrisisMode(db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      role: input.role,
      access: input.access,
      clientId: input.clientId,
      crisisMode: true,
    });
  }

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "incident.opened",
    entityType: "incident",
    entityId: created.id,
  });

  return created;
}

export async function updateIncidentStatus(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    role: MembershipRole;
    access: ClientAccess;
    incidentId: string;
    status: string;
  },
) {
  if (!roleAtLeast(input.role, "MODERATOR")) {
    throw new AppError(403, "FORBIDDEN", "MODERATOR+ can update incidents.");
  }
  if (!(STATUSES as readonly string[]).includes(input.status)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid incident status.");
  }

  const [existing] = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.id, input.incidentId),
        eq(incidents.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new AppError(404, "INCIDENT_NOT_FOUND", "Incident not found.");
  }
  assertClientAllowed(input.access, existing.clientId);

  const resolved =
    input.status === "resolved" || input.status === "closed"
      ? new Date()
      : null;

  const [updated] = await db
    .update(incidents)
    .set({
      status: input.status as (typeof STATUSES)[number],
      resolvedAt: resolved,
      updatedAt: new Date(),
    })
    .where(eq(incidents.id, existing.id))
    .returning();

  if (
    existing.crisisEnabled &&
    (input.status === "resolved" || input.status === "closed")
  ) {
    await db
      .update(clients)
      .set({ crisisMode: false, updatedAt: new Date() })
      .where(
        and(
          eq(clients.id, existing.clientId),
          eq(clients.organizationId, input.organizationId),
        ),
      );
  }

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "incident.status_updated",
    entityType: "incident",
    entityId: existing.id,
    metadata: { status: input.status },
  });

  return updated;
}

export async function addIncidentEvidence(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    role: MembershipRole;
    access: ClientAccess;
    incidentId: string;
    label: string;
    body?: string;
    url?: string;
    sensitive?: boolean;
    commentId?: string;
  },
) {
  if (!roleAtLeast(input.role, "MODERATOR")) {
    throw new AppError(403, "FORBIDDEN", "MODERATOR+ can add evidence.");
  }
  const [existing] = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.id, input.incidentId),
        eq(incidents.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new AppError(404, "INCIDENT_NOT_FOUND", "Incident not found.");
  }
  assertClientAllowed(input.access, existing.clientId);

  const label = input.label.trim();
  if (!label) {
    throw new AppError(400, "VALIDATION_ERROR", "Label is required.");
  }

  const [row] = await db
    .insert(incidentEvidence)
    .values({
      organizationId: input.organizationId,
      incidentId: existing.id,
      label,
      body: input.body?.trim() ?? "",
      url: input.url?.trim() || null,
      sensitive: Boolean(input.sensitive),
      commentId: input.commentId,
      createdByUserId: input.actorId,
    })
    .returning();

  return row;
}

export async function exportIncidentDossier(
  db: Database,
  input: {
    organizationId: string;
    access: ClientAccess;
    incidentId: string;
    includeSensitive?: boolean;
  },
) {
  const [incident] = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.id, input.incidentId),
        eq(incidents.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!incident) {
    throw new AppError(404, "INCIDENT_NOT_FOUND", "Incident not found.");
  }
  assertClientAllowed(input.access, incident.clientId);

  const [client] = await db
    .select({
      id: clients.id,
      name: clients.name,
      crisisMode: clients.crisisMode,
    })
    .from(clients)
    .where(eq(clients.id, incident.clientId))
    .limit(1);

  const evidence = await db
    .select({
      id: incidentEvidence.id,
      label: incidentEvidence.label,
      body: incidentEvidence.body,
      url: incidentEvidence.url,
      sensitive: incidentEvidence.sensitive,
      createdAt: incidentEvidence.createdAt,
    })
    .from(incidentEvidence)
    .where(eq(incidentEvidence.incidentId, incident.id))
    .orderBy(desc(incidentEvidence.createdAt));

  return {
    incident: {
      id: incident.id,
      title: incident.title,
      summary: incident.summary,
      status: incident.status,
      severity: incident.severity,
      evidenceObserved: incident.evidenceObserved,
      coordinationSuspected: incident.coordinationSuspected,
      createdAt: incident.createdAt,
      resolvedAt: incident.resolvedAt,
    },
    client,
    evidence: evidence.map((item) =>
      item.sensitive && !input.includeSensitive
        ? {
            ...item,
            body: "[redacted]",
            url: null,
          }
        : item,
    ),
  };
}
