# Security and Trust

## Threat model

Assume:

- customers may send malicious text;
- social webhooks may be forged;
- LLMs may produce malformed output;
- providers may fail;
- users may attempt cross-tenant access;
- automation rules may accidentally create loops;
- credentials may expire.

## Secrets

Never commit tokens, expose OAuth secrets to the browser, log access tokens, or store plaintext credentials.

Use encrypted storage and environment/secret management.

Provider tokens: application-level encryption at rest (key from env). Session tokens: hash only.

## Webhooks

Always verify signatures, validate payloads, check account ownership, use idempotency, persist before processing.

## Tenant isolation

Every request must resolve organization context.

Every tenant-owned query must enforce it.

## RBAC

Minimum roles:

```text
OWNER
ADMIN
MANAGER
MODERATOR
AGENT
VIEWER
```

Example:

- OWNER: everything including billing later
- ADMIN: configuration
- MANAGER: operations
- MODERATOR: moderation
- AGENT: conversations
- VIEWER: read-only

Permissions should be explicit in code, not implied by role name switches scattered across handlers.

## AI security

Treat all external content as untrusted.

Never allow customer messages to modify system instructions, model output to bypass authorization, or model-generated tool parameters to skip validation.

## Moderation security

A model cannot directly call provider APIs.

Correct:

```text
AI → proposed action → policy → permission → outbound bus → adapter
```

Incorrect:

```text
AI → provider API
```

## Audit

Record: authentication changes, channel connections, moderation decisions, automatic actions, human overrides, policy changes, later agent/automation changes.

## Privacy

Minimize stored personal data. Define retention policies before storing more conversation history than V1 needs.

Do not log comment bodies by default.

## Cost / abuse

Track `usage_events`. Before enabling unattended high volume, add per-organization token budgets and a circuit breaker on inbound storms.

## Incident readiness

Provide structured logs, correlation IDs, action history, provider response status, and audit records so a moderator can answer "Why was this comment hidden?" within seconds.
