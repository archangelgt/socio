# AI Agent System

Phase 4. Do not implement agents, tools, or auto-reply in V1.

V1 uses `AIProvider.moderate` only. Keep this spec so Phase 4 does not invent a second policy model.

## Objective

Build controlled AI agents for social conversations.

The AI does not own application policy. The policy engine does.

## Agent lifecycle

```text
Incoming message/comment
      ↓
Context builder
      ↓
Classification / moderation
      ↓
Knowledge retrieval
      ↓
Agent decision
      ↓
Action proposal
      ↓
Policy validation
      ↓
Human approval OR execution via outbound action bus
```

## Context

May include: current conversation/comment, recent messages, brand configuration, relevant knowledge, agent instructions, channel capabilities, permitted tools.

Never provide the entire knowledge base.

## Structured output

Validate all model output.

## Tools (Phase 4+)

Future tools: search_knowledge, get_product_information, get_store_hours, create_tag, assign_conversation, draft_reply, send_reply, hide_comment, escalate, schedule_post.

Every tool requires typed input, typed output, permission, and an audit event.

Hide/send must enqueue the outbound action bus. Tools never call `ChannelAdapter` directly.

## Permissions

```text
READ_CONVERSATION
SEARCH_KNOWLEDGE
CREATE_TAG
ASSIGN_CONVERSATION
DRAFT_REPLY
SEND_REPLY
HIDE_COMMENT
DELETE_COMMENT
PUBLISH_POST
```

Default agents receive minimum permissions.

## Prompt injection

Customer messages and comments are untrusted data.

Never treat them as system instructions.

The application must enforce tool permissions regardless of model output.

## Confidence

Use confidence only for routing. Same bands as `12_AI_MODERATION.md`:

```text
>= 0.90 → may auto-execute if policy allows
0.70–0.89 → REVIEW_REQUIRED
< 0.70 → REVIEW_REQUIRED
```

## Safety

The model may not independently authorize: financial transactions, refunds, legal commitments, account deletion, credential changes, irreversible actions.

## AI cost controls

Track provider, model, tokens, estimated cost, organization, agent, action in `usage_events`.

Add per-organization budget and a circuit breaker before enabling high-volume auto-reply.

## Prompt versioning

Track prompt ID, version, provider, model, timestamp. Never silently change production prompts.
