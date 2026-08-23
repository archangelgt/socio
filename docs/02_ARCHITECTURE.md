# Architecture

## Goals

Support:

- multi-tenancy
- multiple social networks
- multiple AI providers
- asynchronous processing
- webhook volume
- auditability
- safe automatic moderation
- human review

## Logical architecture

```text
                         Web App
                            |
                       API Gateway
                            |
          +-----------------+-----------------+
          |                 |                 |
        Auth              Inbox          Moderation
          |                 |                 |
          +-----------------+-----------------+
                            |
                      Domain Services
                            |
        +-------------------+-------------------+
        |                   |                   |
     Channels               AI             Knowledge (Phase 3)
        |                   |                   |
        +-------------------+-------------------+
                            |
                     Policy Engine
                            |
                 +----------+----------+
                 |                     |
          Outbound action         Human Review
                 |                     |
                 +----------+----------+
                            |
                       Audit Log
                            |
                    PostgreSQL / Redis
```

The domain must remain functional without AI. AI enhances decisions; application policy determines what may happen.

## Channel adapter

Canonical TypeScript contract: `07_CHANNELS.md` and `packages/channels`.

Do not add a generic `moderateComment` method. Hide and delete are distinct provider operations and must stay distinct.

The domain layer must never depend on provider-specific payloads.

## AI provider abstraction

```ts
interface AIProvider {
  generate(input: AIRequest): Promise<AIResponse>;
  classify(input: ClassificationRequest): Promise<ClassificationResponse>;
  moderate(input: ModerationRequest): Promise<ModerationResponse>;
  embed(input: EmbeddingRequest): Promise<EmbeddingResponse>;
}
```

V1 uses `moderate` (and optionally no-ops for the rest). `embed` is Phase 3. `generate` / `classify` are Phase 4.

## Event processing

```text
receive
 ↓
authenticate (signature)
 ↓
validate
 ↓
idempotency check
 ↓
store raw inbound event
 ↓
respond to provider
 ↓
enqueue inbound-events
 ↓
normalize
 ↓
persist domain records
 ↓
enqueue moderation (comments)
```

Never perform expensive AI processing synchronously in the webhook HTTP request.

## Moderation processing

```text
Comment persisted
     ↓
Moderation worker
     ↓
AI moderation
     ↓
Validate structured output
     ↓
Moderation policy
     ↓
Enqueue outbound action OR mark REVIEW_REQUIRED
     ↓
Outbound worker → ChannelAdapter
     ↓
Audit
```

## Idempotency

Two layers:

1. Inbound events: `(provider, external_event_id, organization_id)`
2. Outbound actions: `(organization_id, social_account_id, external_comment_id, action_type, moderation_policy_version)`

Duplicate events must not create duplicate comments or moderation actions.

## Queues (V1)

- inbound-events
- moderation
- outbound-actions

Later: ai-classification, ai-generation, embeddings, automation-execution, analytics.

## Database

PostgreSQL with UUID primary keys.

Every tenant-owned table must have `organization_id` unless ownership is guaranteed through a tenant-owned parent.

Use application authorization and database constraints together.

See `03_DATABASE.md`.

## Security

- encrypt provider credentials at rest
- never return tokens to the browser
- validate OAuth state
- verify webhook signatures
- redact secrets from logs
- RBAC
- tenant checks on every service operation
- rate limits
- secure worker boundaries

Details: `13_SECURITY.md`.

## Observability

Every request: `request_id`, `organization_id`, `user_id` when available.

AI events: provider, model, latency, tokens, estimated cost, action, success/failure.

Moderation events: provider, model, policy, category, severity, confidence, action, action success/failure.

Never log private comment content by default.

## API

V1 surface is listed in `14_API_CONTRACTS.md`. Publish OpenAPI from the running API.
