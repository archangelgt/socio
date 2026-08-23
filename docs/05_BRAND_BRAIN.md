# Brand Brain

Phase 3. Do not implement ingestion, embeddings, or retrieval in V1.

When this phase starts, add `knowledge_sources` and `knowledge_chunks` (including `brand_id` on chunks) via a new migration. Use pgvector (ADR-008).

## Purpose

Brand Brain is the knowledge and behavior layer that makes the AI specific to each organization.

It is not simply a vector database.

## Components

```text
Brand Brain
├── Brand profile
├── Tone of voice
├── AI instructions
├── FAQs
├── Products/services
├── Policies
├── URLs
├── Documents
├── Knowledge chunks
└── Response rules
```

## Sources

Initial: plain text, PDF, Markdown, URL, FAQ, manual entry.

Future: DOCX, CSV, website crawler, APIs.

## Ingestion

```text
Source → Parse → Clean → Chunk → Metadata → Embed → Store
```

Statuses: pending, processing, ready, failed.

## Metadata

Each chunk includes: organization_id, brand_id, source_id, title, source_type, language, section, authority.

## Retrieval

Filter by organization, brand, knowledge permissions. Prefer authoritative and current sources.

## Tone

Configurable: formal/casual, concise/detailed, friendly/professional, emoji preference, language, forbidden phrases, preferred phrases.

## Conflicts

If sources conflict: authoritative source wins; newer source wins if configured; otherwise escalate. Never invent an answer.

## Admin

Users can upload knowledge, view processing, search, preview chunks, delete sources, mark authoritative, and test AI answers.
