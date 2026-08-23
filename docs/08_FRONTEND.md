# Frontend Agent Instructions

## UX goal

The interface should feel like a modern professional SaaS, not an AI demo.

Prioritize: speed, clarity, information density, keyboard navigation, responsive layouts, obvious AI/human boundaries.

## V1 navigation

```text
Overview
Inbox
Moderation
Channels
Settings
```

Do not ship AI Agents, Brand Brain, Automations, or Publisher in V1. Those routes may exist as disabled placeholders only if they do not imply the feature works.

## Inbox

Desktop:

```text
┌──────────────┬──────────────────────┬────────────────────┐
│ List         │ Detail               │ Context            │
│              │                      │                    │
│ comments /   │ thread or comments   │ post (for comments)│
│ conversations│                      │ moderation         │
│ filters      │ composer (human)     │ tags               │
└──────────────┴──────────────────────┴────────────────────┘
```

Phase 4 adds the AI suggested-reply pane.

Clearly distinguish comments-on-posts from DM conversations.

## Moderation center

Dedicated queue:

```text
Pending review | Auto-hidden | Allowed
```

Filters: channel, category, severity, confidence, status, date, brand, policy.

Actions: Review, Allow, Hide, Restore.

## Moderation detail

Show: original comment, author, post context, AI categories, severity, confidence, policy matched, action taken, timestamp, undo where supported, audit history.

Do not expose chain-of-thought. Show concise decision reasons or policy labels only.

## AI visual language

Clearly distinguish: customer, human, AI suggestion, AI action, automation action.

Never make unapproved AI-generated content look like a human-approved message.

## Brand Brain / Automation

Phase 3 / 5. V1 forms are acceptable when those phases start. Avoid drag-and-drop until the engine is stable.

## Accessibility

Support: keyboard, semantic HTML, visible focus, contrast, screen readers, reduced motion.

## Error UX

Every integration failure must say what failed, why if known, what the user can do, and offer retry when possible.
