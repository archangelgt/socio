# AI Comment Moderation — Core V1 Specification

This file is the source of truth for taxonomy, severity, confidence routing, queue states, and default policies.

## Mission

Build an AI moderation engine that can automatically analyze social-media comments and safely hide offensive, abusive, spam, scam, or otherwise prohibited comments according to configurable organization policies.

## Fundamental architecture

Never allow:

```text
Comment → LLM → Hide comment
```

Use:

```text
Comment
  ↓
AI Moderation
  ↓
Structured result
  ↓
Schema validation
  ↓
Moderation Policy Engine
  ↓
Permission + Channel Capability Check
  ↓
Outbound action queue
  ↓
Provider Adapter
  ↓
Hide / Unhide / Delete / Flag
  ↓
Audit
```

The AI recommends. The application policy decides.

## Moderation categories (canonical, versioned)

Taxonomy version: `2026-08-22`.

### Abuse

- `hate_speech`
- `harassment`
- `bullying`
- `threat`
- `discrimination`
- `severe_profanity`

### Sexual / violent

- `sexual_content`
- `violent_content`
- `graphic_content`

### Safety

- `self_harm_related`

Handle carefully. Default to human review, not automatic hide, unless the organization explicitly configures otherwise.

### Fraud / platform abuse

- `spam`
- `scam`
- `phishing`
- `impersonation`
- `bot_like`
- `repetitive_comment`
- `irrelevant_promotion`

### Normal

- `safe`
- `question`
- `product_question`
- `feedback`
- `complaint`
- `other`

Do not fork this list in product or agent docs.

## Moderation result

```json
{
  "taxonomy_version": "2026-08-22",
  "categories": [
    {
      "name": "harassment",
      "confidence": 0.97
    }
  ],
  "severity": "high",
  "overall_confidence": 0.97,
  "recommended_action": "hide",
  "needs_human_review": false
}
```

Validate with a runtime schema. Never trust arbitrary JSON from an LLM.

## Severity

```text
NONE
LOW
MEDIUM
HIGH
CRITICAL
```

## Confidence routing

Confidence is a routing signal, not proof of truth.

Default (ADR-027 — hide-first for abuse):

```text
≥ 0.65 with matching hide rule     AUTO_HIDDEN
0.50–0.64 abuse / hide signal      AUTO_HIDDEN (uncertain_hide_first)
normal/safe ≥ 0.50                 AUTO_ALLOWED when no violation
below 0.50 without clear allow     REVIEW_REQUIRED
```

Do not leave insulting or profane comments visible while waiting for a human.
Organizations can still raise thresholds; the product default is stricter.

Do not use a queue status named `escalate` for low confidence. `ESCALATE` is an action, not a default routing outcome.

## Default moderation policy

Recommended initial defaults:

```text
hate_speech         LOW+ + >=65% → HIDE (hide-first if uncertain)
harassment          LOW+ + >=65% → HIDE
bullying            LOW+ + >=65% → HIDE
threat              HIGH+        → HIDE + human review (hide-first)
discrimination      LOW+ + >=65% → HIDE
severe_profanity    LOW+ + >=65% → HIDE
spam                MEDIUM+ + >=65% → HIDE
scam                MEDIUM+ + >=65% → HIDE
phishing            MEDIUM+ + >=65% → HIDE
sexual_content      MEDIUM+ + >=65% → HIDE
violent_content     MEDIUM+ + >=65% → HIDE
graphic_content     MEDIUM+ + >=65% → HIDE
self_harm_related                 → REVIEW
unknown                           → REVIEW
safe                              → ALLOW
```

These are defaults, not immutable rules.

## Important distinction

Do not automatically hide every negative comment.

Examples of legitimate comments:

```text
"This product is terrible."
"I hate this company."
"Your service is awful."
```

These may be negative sentiment but are not necessarily policy violations.

Moderation must distinguish criticism, profanity, harassment, threats, hate, and spam.

A negative review should generally remain visible unless it violates a configured rule.

## Context

Moderation may use: comment, parent comment, post text, brand name, recent thread context, author repetition patterns, prior moderation signals.

Do not use irrelevant private data.

## False positives

Every automatic moderation decision must be reversible where provider capabilities permit.

Store: original comment, AI classification, confidence, policy, action, timestamp, provider result, human override.

Track false-positive corrections.

## Human review

Queue states (canonical):

```text
PENDING
AUTO_ALLOWED
AUTO_HIDDEN
REVIEW_REQUIRED
APPROVED
OVERRIDDEN
ACTION_FAILED
```

Human actions: Allow, Hide, Delete if supported, Escalate (action), Mark false positive, Restore if previously hidden and supported.

## Action safety

Before hiding:

```text
1. comment belongs to organization
2. social account belongs to organization
3. policy allows hide
4. channel supports hide
5. action is permitted for the actor
6. confidence threshold is satisfied
7. action is not already executed
```

If any check fails, do not execute.

## Idempotency

Use `organization_id + social_account_id + external_comment_id + moderation_policy_version + action_type` for policy-sourced outbound actions.

## Queue

Never execute provider moderation synchronously inside the webhook request.

Retry transient failures with exponential backoff. Do not retry unauthorized, forbidden, invalid comment, or unsupported action. Move exhausted jobs to a dead-letter queue.

## Audit

Every decision must produce an audit event. Never store chain-of-thought. Store concise machine-readable rationale.

## Admin policy editor

UI: category, severity threshold, confidence threshold, action, human review, enabled.

## Moderation dashboard (V1 thin metrics)

- total comments analyzed
- allowed
- auto-hidden
- review required
- action failures
- false positives
- category distribution
- average confidence
- average moderation latency

Phase 8 expands this into the full analytics product.

## Channel abstraction

Never assume every social network can hide comments. Check `adapter.capabilities().hideComments`.

## AI provider abstraction

```ts
interface ModerationProvider {
  moderate(input: ModerationInput): Promise<ModerationResult>;
}
```

V1 may implement this as a method on `AIProvider`. Support multiple providers.

## Testing

Required: safe comment, negative criticism, profanity, harassment, hate speech, threat, spam, scam, ambiguous, multilingual, low confidence, duplicate webhook, duplicate moderation job, provider failure, unsupported hide, human override, restore, tenant isolation, prompt injection.

## Multilingual moderation

Do not assume English. Initial language detection should support Spanish, English, and Portuguese.

## Performance target

- webhook response: < 1 second under normal conditions
- moderation processing: near-real-time where provider latency allows

Do not sacrifice correctness for arbitrary latency targets.

## Product principle

The goal is not "delete everything offensive."

The goal is: protect a community automatically while minimizing false positives and preserving legitimate conversation.
