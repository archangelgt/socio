# Product Specification

## Working name

`Social AI Platform`.

Do not treat this as the final commercial name.

## Product statement

An AI operating system for social conversations, moderation, and community operations.

Businesses connect social accounts and receive one workspace where AI can understand, classify, moderate, respond, automate, and escalate social interactions.

## Primary users

### Brand owner

Needs visibility, control, safety, and analytics.

### Social media manager

Needs a unified inbox, AI replies, moderation, and publishing.

### Community manager

Needs automatic comment moderation and engagement tools.

### Customer support agent

Needs context, suggested responses, and escalation.

### Agency

Needs multiple organizations/brands and role-based access.

Agencies use multiple brands inside one organization, or memberships across organizations. A given social account (provider + external id) is actively connected to at most one organization.

## Core objects

V1:

- Organization
- User
- Membership
- Invitation
- Session
- Brand
- SocialAccount
- InboundEvent
- Post
- Contact
- Conversation
- Message
- Comment
- Tag
- ModerationPolicy
- ModerationRule
- ModerationDecision
- ModerationAction
- AuditEvent
- UsageEvent

Later phases (do not implement in V1):

- AI Agent
- KnowledgeSource / KnowledgeDocument / KnowledgeChunk
- Automation / AutomationExecution
- AIAction / Approval
- Campaign / ScheduledPost

## Core inbound workflow

```text
Social network
      ↓
Webhook / polling adapter
      ↓
Validate + verify signature
      ↓
Idempotency check
      ↓
Store raw inbound event
      ↓
Normalize event
      ↓
Persist post / comment / message
      ↓
Enqueue moderation (comments)
      ↓
AI moderation → schema validation
      ↓
Policy engine
      ↓
┌───────────────┬─────────────────┐
│ Outbound queue│ Human review    │
└───────────────┴─────────────────┘
      ↓
Audit event
      ↓
Thin moderation metrics
```

Comments live on posts. Direct messages live in conversations. The inbox lists both, with a type indicator. Replying to a comment does not create a DM conversation unless the channel adapter says that is how the provider works.

## Unified inbox

V1 support:

- comment list and conversation list
- unread state
- assignment (conversations)
- tags
- channel indicator
- post context for comments
- moderation status, severity, confidence
- timeline
- internal notes
- close/reopen (conversations)

Phase 4 adds: AI classification, sentiment, intent, suggested reply, regenerate, approve/reject AI replies.

## AI moderation

Canonical taxonomy, severity, actions, confidence routing, and queue states live in `12_AI_MODERATION.md`. Do not duplicate enums here.

Product rules that must not be lost:

- Confidence is a routing signal, not proof of truth.
- Negative criticism is not automatically a policy violation.
- Self-harm related content defaults to human review.
- Automatic hide is opt-in per organization/policy.
- Hide is preferred over delete.
- Every automatic action is reversible where the channel allows it.

## Brand Brain

Phase 3. Spec: `05_BRAND_BRAIN.md`.

## AI reply policy

Phase 4. Suggested responses may be generated automatically. Automatic outbound replies require explicit organization policy and agent permission. Spec: `04_AI_AGENT.md`.

## Human-in-the-loop

Default is human approval for destructive or outbound actions.

Organizations can enable automatic hide individually.

High-risk actions remain human-approved.

## V1 (ship this)

Must include:

- organizations, users, memberships, invitations, sessions
- brands
- Meta adapter architecture for Instagram and Facebook
- unified inbox for comments and messages
- posts as comment context
- AI gateway (mock + at least one real provider behind the interface)
- AI moderation
- automatic hide when policy permits
- moderation queue
- audit log
- thin moderation metrics (counts by status/category, not the Phase 8 product)

Must not include:

- Brand Brain / RAG
- AI reply suggestions
- automation engine
- publisher
- billing
- non-Meta channels
