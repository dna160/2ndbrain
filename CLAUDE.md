# CLAUDE.md — Recall Build Operating Manual

You are building **Recall**: a WhatsApp-native second brain for a strategic operator in Jakarta.
It ingests WhatsApp messages/voice notes (relayed from the Lynkbot WABA), audio uploads (Plaud
recordings), and Google Calendar events; produces Plaud-grade meeting notes (topic-segmented,
timestamped, speaker-attributed, with per-participant AI recommendations); maintains a
three-tier graph memory; and delivers a nightly digest + pre-meeting briefs back over WhatsApp.

## Read order (always)

1. This file
2. `docs/00-PRD.md` — what we are building and why
3. `docs/01-ARCHITECTURE.md` — system design, schema, dedupe manifest from Lynkbot
4. `docs/02-DESIGN-SYSTEM.md` — UI/UX law for `apps/web`
5. `docs/03-BUILD-PHASES.md` — your task list; work ONE phase at a time
6. `docs/04-PROMPTS.md` — LLM prompt systems (verbatim starting points)

## Context management rules (you are Opus 4.8 — use context deliberately, not carelessly)

- Load only the docs + files the current phase names in its "Context to load" block.
- Never load `docs/04-PROMPTS.md` unless the phase touches an LLM job.
- When a phase is complete, write `docs/progress/PHASE-N-DONE.md` (what shipped, deviations,
  decisions taken) before starting the next phase. Read the previous phase's DONE file at the
  start of each new phase instead of re-reading its full diff.
- Reference Lynkbot patterns from the manifest in `01-ARCHITECTURE.md §3` — do not clone the
  whole Lynkbot repo into context; pull only the named files.

## Hard conventions

- **TypeScript strict everywhere.** No `any` in committed code. `unknown` + narrowing.
- **Monorepo:** pnpm workspaces. `apps/api` (Fastify), `apps/web` (Next.js 14 App Router),
  `packages/shared` (zod schemas + types — the single source of truth for API contracts).
- **Every API request/response shape is a zod schema in `packages/shared`.** API validates with
  it; web imports the inferred types. If a contract changes, change the schema first.
- **tenantId on every table, every query.** Single-tenant today, multi-tenant tomorrow. No exceptions.
- **All slow work goes through BullMQ.** HTTP handlers enqueue and return. Workers process.
- **Every pipeline job writes stage transitions + cost columns to `pipeline_runs`.** A job that
  doesn't log its stages is a bug, not a style choice.
- **Provenance is non-negotiable.** Memories, entity links, and digest claims carry
  `provenanceEventIds`. If you can't trace it, don't store it.
- **Money:** costs metered in IDR (integer, no floats for currency).
- **Time:** store UTC, render Asia/Jakarta (WIB) in `apps/web` and in WA-delivered text.
- **Language:** transcripts verbatim as spoken (ID/EN/mixed); summaries mirror dominant
  language; action items normalized to English.

## Commands (must all pass before any phase is "done")

```bash
pnpm typecheck        # tsc --noEmit across workspaces
pnpm lint             # eslint, zero warnings
pnpm test             # vitest unit + integration
pnpm test:e2e         # playwright (phases 4+)
pnpm build            # all workspaces build clean
```

## QC gates (from docs/03 — enforced per phase)

- Coverage: statements ≥80%, branches ≥75%, functions ≥85%; **100% on ingestion idempotency,
  auth guards, cost metering, and memory-write paths.**
- Every endpoint has a supertest contract test against its zod schema.
- Every queue worker has a test covering: success, retryable failure, poison message → DLQ.
- Golden fixtures in `fixtures/`: sample Meta relay payload, 2 short audio files (ID + mixed
  ID/EN), expected structuring output. Structuring changes must keep golden tests green or
  update goldens with justification in the phase DONE file.
- No phase closes with a failing CI pipeline.

## Environment keys (registry in 01-ARCHITECTURE §8; never hardcode)

DATABASE_URL, REDIS_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, R2_* (account, key, secret,
bucket), GROQ_API_KEY, DEEPSEEK_API_KEY, EMBEDDINGS_API_KEY, LYNKBOT_RELAY_SECRET,
LYNKBOT_INTERNAL_URL (takeover endpoint), META_ACCESS_TOKEN, META_PHONE_NUMBER_ID,
INTERNAL_API_KEY, APP_URL.

Capture model: **default-capture, blacklist-to-exclude.** All WABA inbound is relayed and
persisted unless the sender is blocked in `waContacts`; blocked = dropped at ingest, never
stored. The blacklist exists only in Recall. Blacklist purge is the ONLY permitted
hard-delete path in the codebase.

## What NOT to build (out of scope — do not gold-plate)

Gmail ingestion; voiceprint enrollment; native mobile apps; multi-workspace UI; billing;
pyannote worker (scaffold the interface only — see 03 Phase 3); auto-booking without human
confirmation (never).
