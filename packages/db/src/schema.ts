import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const membershipRoleEnum = pgEnum("membership_role", [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "MODERATOR",
  "AGENT",
  "VIEWER",
]);

export const socialAccountStatusEnum = pgEnum("social_account_status", [
  "active",
  "disconnected",
  "error",
]);

export const inboundEventStatusEnum = pgEnum("inbound_event_status", [
  "received",
  "processed",
  "ignored",
  "failed",
]);

export const messageDirectionEnum = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);

export const senderTypeEnum = pgEnum("sender_type", [
  "contact",
  "brand",
  "system",
]);

export const commentVisibilityEnum = pgEnum("comment_visibility", [
  "visible",
  "hidden",
  "deleted",
  "unknown",
]);

export const queueStateEnum = pgEnum("queue_state", [
  "PENDING",
  "AUTO_ALLOWED",
  "AUTO_HIDDEN",
  "REVIEW_REQUIRED",
  "APPROVED",
  "OVERRIDDEN",
  "ACTION_FAILED",
]);

export const severityEnum = pgEnum("severity", [
  "NONE",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const moderationActionEnum = pgEnum("moderation_action", [
  "ALLOW",
  "FLAG",
  "HIDE",
  "DELETE",
  "ESCALATE",
  "TAG",
  "NOTIFY",
]);

export const actionSourceEnum = pgEnum("action_source", ["policy", "human"]);

export const outboundStatusEnum = pgEnum("outbound_status", [
  "queued",
  "succeeded",
  "failed",
  "skipped",
]);

export const taggingEntityEnum = pgEnum("tagging_entity", [
  "comment",
  "conversation",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  status: text("status").notNull().default("active"),
  ...timestamps,
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  email: text("email").notNull(),
  role: membershipRoleEnum("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  invitedByUserId: uuid("invited_by_user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: membershipRoleEnum("role").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("memberships_org_user").on(table.organizationId, table.userId),
    index("memberships_org_idx").on(table.organizationId),
  ],
);

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    defaultLanguage: text("default_language").notNull().default("en"),
    timezone: text("timezone").notNull().default("UTC"),
    ...timestamps,
  },
  (table) => [
    unique("brands_org_slug").on(table.organizationId, table.slug),
    index("brands_org_idx").on(table.organizationId),
  ],
);

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    provider: text("provider").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    displayName: text("display_name").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    status: socialAccountStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    unique("social_accounts_org_provider_ext").on(
      table.organizationId,
      table.provider,
      table.externalAccountId,
    ),
    uniqueIndex("social_accounts_active_provider_ext")
      .on(table.provider, table.externalAccountId)
      .where(sql`${table.status} = 'active'`),
    index("social_accounts_org_idx").on(table.organizationId),
  ],
);

export const inboundEvents = pgTable(
  "inbound_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    socialAccountId: uuid("social_account_id").references(
      () => socialAccounts.id,
    ),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    processingStatus: inboundEventStatusEnum("processing_status")
      .notNull()
      .default("received"),
    errorMessage: text("error_message"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    unique("inbound_events_provider_ext").on(
      table.provider,
      table.externalEventId,
    ),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    externalIdentityHash: text("external_identity_hash").notNull(),
    displayName: text("display_name"),
    username: text("username"),
    avatarUrl: text("avatar_url"),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    ...timestamps,
  },
  (table) => [
    unique("contacts_org_hash").on(
      table.organizationId,
      table.externalIdentityHash,
    ),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id),
    externalPostId: text("external_post_id").notNull(),
    body: text("body"),
    permalink: text("permalink"),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("posts_account_ext").on(table.socialAccountId, table.externalPostId),
    index("posts_org_idx").on(table.organizationId),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    externalConversationId: text("external_conversation_id").notNull(),
    status: text("status").notNull().default("open"),
    assignedUserId: uuid("assigned_user_id").references(() => users.id),
    unread: boolean("unread").notNull().default(true),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("conversations_account_ext").on(
      table.socialAccountId,
      table.externalConversationId,
    ),
    index("conversations_org_last_msg_idx").on(
      table.organizationId,
      table.lastMessageAt,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    externalMessageId: text("external_message_id").notNull(),
    direction: messageDirectionEnum("direction").notNull(),
    senderType: senderTypeEnum("sender_type").notNull(),
    senderExternalId: text("sender_external_id"),
    body: text("body").notNull(),
    attachmentsJson: jsonb("attachments_json").notNull().default([]),
    providerMetadataJson: jsonb("provider_metadata_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("messages_conversation_ext").on(
      table.conversationId,
      table.externalMessageId,
    ),
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id),
    postId: uuid("post_id").references(() => posts.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    externalCommentId: text("external_comment_id").notNull(),
    externalPostId: text("external_post_id").notNull(),
    parentExternalCommentId: text("parent_external_comment_id"),
    authorExternalId: text("author_external_id").notNull(),
    authorDisplayName: text("author_display_name"),
    body: text("body").notNull(),
    status: commentVisibilityEnum("status").notNull().default("visible"),
    moderationStatus: queueStateEnum("moderation_status")
      .notNull()
      .default("PENDING"),
    severity: severityEnum("severity"),
    aiConfidence: doublePrecision("ai_confidence"),
    language: text("language"),
    ...timestamps,
  },
  (table) => [
    unique("comments_account_ext").on(
      table.socialAccountId,
      table.externalCommentId,
    ),
    index("comments_org_moderation_idx").on(
      table.organizationId,
      table.moderationStatus,
      table.createdAt,
    ),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    brandId: uuid("brand_id").references(() => brands.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("tags_org_name_global")
      .on(table.organizationId, table.name)
      .where(sql`${table.brandId} is null`),
    uniqueIndex("tags_org_brand_name")
      .on(table.organizationId, table.brandId, table.name)
      .where(sql`${table.brandId} is not null`),
  ],
);

export const taggings = pgTable(
  "taggings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id),
    entityType: taggingEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("taggings_tag_entity").on(
      table.tagId,
      table.entityType,
      table.entityId,
    ),
  ],
);

export const moderationPolicies = pgTable(
  "moderation_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    confidenceThreshold: doublePrecision("confidence_threshold")
      .notNull()
      .default(0.9),
    ...timestamps,
  },
  (table) => [index("moderation_policies_org_idx").on(table.organizationId)],
);

export const moderationRules = pgTable("moderation_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  moderationPolicyId: uuid("moderation_policy_id")
    .notNull()
    .references(() => moderationPolicies.id),
  category: text("category").notNull(),
  minimumSeverity: severityEnum("minimum_severity").notNull(),
  minimumConfidence: doublePrecision("minimum_confidence").notNull(),
  action: moderationActionEnum("action").notNull(),
  requireHuman: boolean("require_human").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  ...timestamps,
});

export const moderationDecisions = pgTable(
  "moderation_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id),
    policyId: uuid("policy_id").references(() => moderationPolicies.id),
    policyVersion: text("policy_version"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    categoriesJson: jsonb("categories_json").notNull(),
    severity: severityEnum("severity").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    rationale: text("rationale"),
    recommendedAction: moderationActionEnum("recommended_action").notNull(),
    finalAction: moderationActionEnum("final_action"),
    status: queueStateEnum("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("moderation_decisions_comment_idx").on(table.commentId)],
);

export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    moderationDecisionId: uuid("moderation_decision_id").references(
      () => moderationDecisions.id,
    ),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id),
    source: actionSourceEnum("source").notNull(),
    actionType: text("action_type").notNull(),
    provider: text("provider").notNull(),
    externalActionId: text("external_action_id"),
    status: outboundStatusEnum("status").notNull().default("queued"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("moderation_actions_comment_idx").on(table.commentId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_events_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  action: text("action").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  estimatedCostCents: integer("estimated_cost_cents"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
