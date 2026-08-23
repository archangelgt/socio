# Database Specification

Use PostgreSQL. Schema is owned by `packages/db` (Drizzle).

Phase tags: implement V1 tables now. Do not migrate Phase 3+ tables until that phase starts.

## Tenancy

```text
organizations
users
sessions
invitations
memberships
brands
social_accounts
```

Every lookup of tenant data takes `{ organizationId, id }`. Never `findX(id)` alone.

## organizations

- id
- name
- slug
- status
- created_at
- updated_at

## users

- id
- email (unique)
- password_hash
- name
- avatar_url
- status
- created_at
- updated_at

## sessions

- id
- user_id
- token_hash (unique)
- expires_at
- revoked_at
- ip
- user_agent
- created_at

## invitations

- id
- organization_id
- email
- role
- token_hash
- invited_by_user_id
- expires_at
- accepted_at
- created_at

## memberships

- id
- organization_id
- user_id
- role (`OWNER` | `ADMIN` | `MANAGER` | `MODERATOR` | `AGENT` | `VIEWER`)
- created_at
- updated_at

Unique: `organization_id + user_id`

## brands

- id
- organization_id
- name
- slug
- description
- default_language
- timezone
- created_at
- updated_at

Unique: `organization_id + slug`

V1 does not store tone_of_voice / ai_enabled on brands (Phase 3–4).

## social_accounts

- id
- organization_id
- brand_id
- provider
- external_account_id
- display_name
- access_token_encrypted
- refresh_token_encrypted
- token_expires_at
- metadata_json
- status (`active` | `disconnected` | `error`)
- created_at
- updated_at

Partial unique: `(provider, external_account_id)` WHERE `status = 'active'` (ADR-021).

Also unique: `organization_id + provider + external_account_id`.

## inbound_events

- id
- organization_id (nullable until account is resolved)
- social_account_id (nullable until resolved)
- provider
- external_event_id
- payload_json
- processing_status (`received` | `processed` | `ignored` | `failed`)
- error_message
- received_at
- processed_at

Unique: `provider + external_event_id` (provider event ids are globally unique per app; if a provider can collide, include `social_account_id`).

Store the raw body before enqueueing work.

## contacts

- id
- organization_id
- external_identity_hash
- display_name
- username
- avatar_url
- metadata_json
- created_at
- updated_at

Unique: `organization_id + external_identity_hash`

## posts

- id
- organization_id
- brand_id
- social_account_id
- external_post_id
- body
- permalink
- metadata_json (`thumbnailUrl`, `mediaType` for the post preview)
- published_at
- created_at
- updated_at

Unique: `social_account_id + external_post_id`

Required so the moderation UI can show comment context.

## conversations

- id
- organization_id
- brand_id
- social_account_id
- contact_id
- external_conversation_id
- status
- assigned_user_id
- unread
- last_message_at
- created_at
- updated_at

Unique: `social_account_id + external_conversation_id`

`sentiment`, `intent`, `ai_confidence` are Phase 4 columns. Do not add them in V1.

## messages

- id
- organization_id
- conversation_id
- external_message_id
- direction (`inbound` | `outbound`)
- sender_type (`contact` | `brand` | `system`)
- sender_external_id
- body
- attachments_json
- provider_metadata_json
- created_at

Unique: `conversation_id + external_message_id`

## comments

- id
- organization_id
- brand_id
- social_account_id
- post_id (nullable if the post is not yet ingested)
- contact_id (nullable)
- external_comment_id
- external_post_id
- parent_external_comment_id
- author_external_id
- author_display_name
- body
- status (`visible` | `hidden` | `deleted` | `unknown`)
- moderation_status (see `12_AI_MODERATION.md` queue states)
- severity
- ai_confidence
- language
- created_at
- updated_at

Unique: `social_account_id + external_comment_id`

## tags

- id
- organization_id
- brand_id (nullable = org-wide)
- name
- created_at

Unique: `organization_id + brand_id + name` with a consistent null treatment (use `''` sentinel or a partial unique index).

## taggings

- id
- organization_id
- tag_id
- entity_type (`comment` | `conversation`)
- entity_id
- created_at

Unique: `tag_id + entity_type + entity_id`

## moderation_policies

- id
- organization_id
- brand_id
- name
- enabled
- confidence_threshold
- created_at
- updated_at

Rules live in `moderation_rules` only. Do not store a parallel `rules_json`.

## moderation_rules

- id
- organization_id
- moderation_policy_id
- category
- minimum_severity
- minimum_confidence
- action
- require_human
- enabled
- created_at
- updated_at

## moderation_decisions

- id
- organization_id
- brand_id
- comment_id
- policy_id
- policy_version
- provider
- model
- categories_json
- severity
- confidence
- rationale (short, never chain-of-thought)
- recommended_action
- final_action
- status
- created_at

## moderation_actions

Outbound action bus (ADR-020).

- id
- organization_id
- moderation_decision_id (nullable for human-only actions)
- comment_id
- social_account_id
- source (`policy` | `human`)
- action_type (`hide` | `unhide` | `delete` | `allow`)
- provider
- external_action_id
- status (`queued` | `succeeded` | `failed` | `skipped`)
- error_code
- error_message
- executed_at
- created_at

Unique for idempotency: `organization_id + social_account_id + external_comment_id + action_type + policy_version` for policy-sourced actions. Human retries may insert a new row.

Phase 5 adds `source = automation`.

## audit_events

- id
- organization_id
- actor_type (`user` | `system` | `ai_policy`)
- actor_id
- event_type
- entity_type
- entity_id
- metadata_json
- created_at

## usage_events

- id
- organization_id
- provider
- model
- action
- input_tokens
- output_tokens
- estimated_cost_cents
- latency_ms
- created_at

## Indexes (V1)

Prioritize:

- `organization_id` on every tenant table
- `organization_id + last_message_at` on conversations
- `organization_id + moderation_status + created_at` on comments
- `conversation_id + created_at` on messages
- `comment_id` on decisions and actions
- inbound event unique keys
- external id unique keys

## Later phases (do not create in V1)

- agents
- knowledge_sources / knowledge_chunks (add `brand_id` on chunks when created)
- automations / automation_executions
- ai_actions
- campaigns / scheduled_posts
- prompt_versions

## Tenant isolation

Never expose:

```ts
findConversation(id)
findComment(id)
```

Prefer:

```ts
findConversation({ organizationId, conversationId })
findComment({ organizationId, commentId })
```

This is mandatory.
