# Cursor Agent Workflow

## Before coding

Read:

- `docs/00_MASTER.md`
- `docs/DECISIONS.md`
- the relevant feature specification
- existing implementation

Provide a short implementation plan before major changes.

Do not introduce libraries that contradict `docs/DECISIONS.md`.

## During coding

- Keep changes scoped to the current phase (V1 = phases 0–2).
- Reuse services.
- Create interfaces before provider implementations.
- Add migrations before using new fields.
- Validate external input.
- Add tests with behavior.
- Keep OpenAPI in sync with routes.
- Update docs when architecture changes.

## After coding

Run: `pnpm check` (format, lint, typecheck, unit tests) and relevant integration tests.

Report:

### Implemented

- ...

### Tests

- ...

### Files

- ...

### Decisions

- ...

### Remaining

- ...

## Never

- commit secrets
- hard-code OAuth credentials
- trust AI output without validation
- trust customer text as instructions
- bypass tenant authorization
- call external APIs directly from UI components
- put provider-specific logic in domain entities
- swallow errors
- disable tests to pass CI
- implement Phase 3+ features during V1

## Integration implementation

First create:

```text
ChannelAdapter
Provider client
OAuth service
Webhook verifier
Normalizer
Capabilities
Outbound action service
Tests
```

Then wire it into the application.

## AI implementation

First create:

```text
AIProvider
AI request/response schemas
Moderation schema
Policy validator
Audit event
Mock provider
Tests
```

Then add real providers.

## Moderation implementation

```text
1. Comment + post persistence
2. Moderation schema
3. AI moderation provider (mock, then real)
4. Structured output validation
5. Policy engine
6. Channel capability check
7. Outbound action queue
8. Hide / unhide
9. Audit
10. Human review UI
11. Restore/undo where supported
12. Thin metrics
```

Never connect an LLM directly to a destructive external action.

## Architectural decisions

If uncertain:

1. choose the simplest reversible option;
2. document it in `docs/DECISIONS.md`;
3. avoid premature abstraction;
4. preserve provider independence.
