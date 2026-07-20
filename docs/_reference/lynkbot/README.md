# Lynkbot reference (vendored, read-only)

The manifest-named files from `docs/01-ARCHITECTURE.md §3` (Lynkbot dedupe manifest), pulled
verbatim from the source repo so Recall's dedupe adapts from **real code**, not prose.

- **Source:** `github.com/dna160/lynkbot`
- **Commit:** `44df880cb61b6bb2c039cea3c0203c182df3262b`
- **Fetched:** 2026-07-20

**These files are reference only** — not built, typechecked, or linted (excluded in
`.eslintrc.cjs` + `.prettierignore`; outside every `tsconfig` `include`). Do not import from
here. Adapt the pattern into `apps/api` / `packages/shared`, changing names to `recall-*`.

## Files (by manifest category)

**COPY-ADAPT**
- `apps/api/src/migrate.ts` — hand-rolled idempotent runner (`schema_migrations` tracking,
  tx-per-file). **Adopted** in `apps/api/src/db/migrate.ts` (reads drizzle-kit `.sql`).
- `apps/api/src/middleware/internalApiKey.ts` — `x-internal-api-key` guard. **Adopted** (with a
  timing-safe compare upgrade) in `apps/api/src/middleware/internalApiKey.ts`.
- `apps/api/src/plugins/{cors,metrics}.ts` — Fastify plugins (Phase 2+).
- `apps/api/src/routes/internal/{cron,dlq}.ts` — repeatable-seed + DLQ patterns (Phase 2).
- `packages/shared/src/constants/queues.ts` — `QUEUES` const shape + `QueueName` type.
- `apps/worker/src/queues.ts` — BullMQ connection helper.
- `packages/ai/src/llm/{ILLMClient,factory}.ts` + `packages/ai/src/index.ts` — `getLLMClient()`
  dual-model abstraction (Phase 3/6).
- `apps/api/src/routes/v1/ai.ts` — JSON fence-rescue / shape-normalization parser (Phase 3).

**PATTERN-REFERENCE**
- `apps/api/src/routes/webhooks/meta.ts` — idempotent-ingest shape (Phase 2 `/ingest/wa`).
- `apps/api/src/middleware/metaSignature.ts` — HMAC verify shape (Phase 2 `relayHmac`).
- `apps/api/src/services/scheduling.service.ts` — envelope parsing + reminder enqueue (Phase 5).
- `apps/api/src/routes/v1/{intelligence,broadcasts}.ts` — genome EMA merge (Phase 6) +
  24h/template pacing (Phase 5).

## Conventions to adopt as standard from Phase 2 onward

1. **`@CLAUDE_CONTEXT` file header** (Package/File/Role/Exports) on new source files.
2. **Namespaced queue values** — `QUEUES.X = 'recall-x'` + exported `QueueName` type
   (Recall's `@recall/shared` currently uses bare names; namespace them when BullMQ lands).
3. **Idempotent ingest** — `onConflictDoNothing` insert → duplicate = 200 early-return → enqueue.
4. **HMAC note:** Lynkbot's `metaSignature` has **no replay protection**. Recall's relay uses a
   separate `x-relay-signature` (LYNKBOT_RELAY_SECRET); add timestamp+nonce anti-replay there.

## Recall's deliberate structural deviations from Lynkbot

- Worker is the **same api image via `MODE=worker`** (Lynkbot has a separate `apps/worker`).
- DB lives in **`apps/api/src/db`** (Lynkbot has a `packages/db` + `@lynkbot/db` pgClient).
- LLM abstraction will live under `apps/api/src/services/llm` (Lynkbot: `packages/ai`).
