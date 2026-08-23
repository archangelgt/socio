# Automation Engine

Phase 5. Do not implement the engine in V1.

`packages/automation` may exist as a stub so the monorepo layout stays stable.

## Goal

Create deterministic workflows around social events, AI classifications, and moderation decisions.

## Model

```text
TRIGGER → CONDITIONS → ACTIONS
```

## Hard rule

Automation never calls a `ChannelAdapter`.

Actions such as `hide_comment` or `send_reply` insert into the same outbound action bus as the moderation policy engine (ADR-020).

If moderation already executed an equivalent action for the same comment, automation must no-op (idempotency + loop prevention).

## Triggers

comment received, message received, conversation created, sentiment changed, intent detected, moderation decision created, tag added, schedule.

## Conditions

Examples: channel, intent, sentiment, moderation category/severity/confidence, tags, language.

## Actions

add tag, assign user, set priority, generate AI reply, send reply, hide comment, escalate, notify team, close conversation.

## Execution

Record automation ID, triggering event, organization ID, execution ID, timestamp, status, action results, error.

## Idempotency

Duplicate events must not execute the same outbound action twice.

## Loop prevention

Prevent:

```text
comment → automation → reply/action → provider event → same automation
```

Track origin and execution IDs on inbound events and outbound actions.

## Human approval

Actions support required, optional, never. Global policy may override automation settings.

## Moderation integration

Example: WHEN comment_received IF category = hate_speech AND severity >= high AND confidence >= 0.90 THEN hide_comment THEN create_audit_event.

This is equivalent to a moderation rule. Prefer moderation policies for hide/delete. Use automations for routing (tag, assign, notify).

## Future visual builder

V1 of this phase may use forms. Do not build drag-and-drop until the engine is stable.
