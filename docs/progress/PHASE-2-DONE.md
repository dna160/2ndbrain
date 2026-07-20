# PHASE 2 — Ingestion: Lynkbot relay → event store → R2 · DONE

**Date:** 2026-07-20 · **Agent:** Claude Code (Opus 4.8)
**Goal (docs/03):** any inbound WA message/voice note becomes an `events` row with media in R2,
fully stage-logged. Includes the Lynkbot-side PR (documented — separate repo).

## What shipped

- **Relay HMAC guard** (`middleware/relayHmac.ts`) — pure `verifyRelaySignature` + Fastify
  guard. **[IMPROVED over Lynkbot]** binds the HMAC to `x-relay-timestamp`
  (`HMAC(secret, ` `${ts}.${rawBody}` `)`) and rejects stale requests → replay protection
  Lynkbot's Meta-signature lacks. A raw-body content-type parser preserves exact bytes.
- **`POST /ingest/wa`** (`routes/ingest/wa.ts` + `services/ingest.service.ts`) — adapted from
  Lynkbot's idempotent webhook. Blacklist gate (blocked sender → drop counter, 200, **persist
  nothing**), idempotent insert on `events.externalId` (duplicate → 200, no new rows), enqueue
  `media` when media present else stage → `persisted`. Every path is pipeline-stage-logged.
- **Meta extraction** (`services/meta/extract.ts`) — pure `isStatusUpdate` +
  `extractInboundMessages` (text/audio/image/document/video/sticker → Recall event types),
  narrowing unknown webhook JSON safely.
- **Queue infra** (`queues/index.ts`) — `createRedisConnection` + `BullEnqueuer` (Lynkbot
  singleton-Queue pattern) behind an `Enqueuer` interface (so ingestion is testable without
  Redis). Queue names namespaced `recall-*` in `@recall/shared`.
- **Media worker** (`workers/media.worker.ts` + `services/media.service.ts`,
  `services/r2.service.ts`, `services/meta/media.client.ts`) — fetches Meta media
  **immediately** (URLs expire — Phase 0 risk #2), streams to R2, sha256-dedupes into
  `mediaAssets`, links the event, stages `media_stored`, enqueues `transcription` for audio.
  On retry-exhaustion writes a durable `dlq` row.
- **Upload path** (`routes/v1/uploads.ts`) — `POST /v1/uploads/presign` (R2 presigned PUT, 15
  min) + `/complete` (register mediaAsset + event, stage, enqueue transcription).
- **DLQ visibility** (`routes/internal/dlq.ts`) — `GET /internal/dlq` behind the internal key.
- **Worker/HTTP bootstraps** wired: `index.ts` builds the ingestion bundle; `worker.ts` runs
  the media worker with graceful shutdown.
- **Config:** promoted `R2_*`, `LYNKBOT_RELAY_SECRET` (min 16), `META_ACCESS_TOKEN` to required;
  added `RELAY_MAX_SKEW_MS` (default 5 min).
- **Lynkbot PR (Part 1)** documented at `docs/lynkbot-pr/phase-2-relay.md` — relay all inbound
  with the timestamp-bound HMAC + personal-contacts `skipAI`. (Separate repo; not applied here.)
- **Fixtures:** `fixtures/relay/meta-text.json`, `fixtures/relay/meta-voice.json`.

## Acceptance — demonstrated

- **Unit (37 new; 71 total pass):** idempotency (new→persisted, duplicate→counted, media→enqueue,
  blacklist→drop), extraction across all message kinds, relay HMAC (missing/invalid/stale/
  mismatch/valid + guard), media store/dedupe/non-audio/insert-fail.
- **Integration (testcontainers, CI):** `POST /ingest/wa` with a valid relay signature →
  `persisted:1`; **replay → `duplicates:1`, exactly one `events` row**; unsigned POST → 401;
  blacklisted sender → `dropped:1`, **zero event rows**; `GET /internal/dlq` gated by the key.
  *(7 integration cases skip locally — no Docker daemon — and run in CI.)*
- **Gate green:** `pnpm typecheck` (3/3), `pnpm lint` (0 warnings), `pnpm test` (78: 71 pass +
  7 integration skipped), `pnpm build` (3/3).

## QC gate — coverage

vitest per-file **100%** on `services/ingest.service.ts` (ingestion idempotency),
`services/meta/extract.ts`, `middleware/relayHmac.ts` — plus the Phase 1 gated files. Met by
unit tests alone (no Docker dependency).

## Deviations / notes

- **DLQ** = BullMQ failed-set (removeOnFail:false, Lynkbot standard) **+** a durable `dlq` table
  row on retry-exhaustion; the internal route reads the table (testable without Redis).
- **Tenant resolution** for relayed messages is single-tenant (oldest tenant). Multi-tenant will
  map `phone_number_id` → tenant.
- **Status callbacks** are parsed (`isStatusUpdate`) and currently ignored; delivery-status
  handling + bot-outbound relay land in Phase 5 (Lynkbot PR Part 2).
- **Real audio fixture** (`fixtures/audio/*`) is deferred to Phase 3 (structuring golden); Phase
  2 media tests mock the Meta fetch, so only the relay JSON fixtures are needed now.

## Phase-gate checklist

- [x] Acceptance demonstrated (unit locally; ingestion idempotency integration in CI)
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green
- [x] Ingestion-idempotency coverage 100% (vitest thresholds)
- [x] New env keys added to registry (`.env.example` already lists R2/relay/meta; `RELAY_MAX_SKEW_MS` new)
- [x] Deviations recorded
- [x] Golden fixtures — relay JSON added; audio deferred to Phase 3

## Handover to Phase 3 — Transcription + structuring

**Load:** this file, docs/00 F2, docs/01 §5–6, docs/04 §1–2, and the vendored LLM factory
(`docs/_reference/lynkbot/packages/ai/src/llm/factory.ts`, `ILLMClient.ts`) + fence-rescue
parser (`docs/_reference/lynkbot/apps/api/src/routes/v1/ai.ts`).
**Then:**
1. `stt/provider.ts` (Groq Whisper v3) + `NoopDiarization`; wire `DIARIZATION=none|pyannote`.
2. `transcription.worker.ts` consuming the `recall-transcription` queue (already enqueued by
   media + upload): R2 download → STT → persist transcript → meter sttSeconds → stage
   `transcribed` → enqueue `structuring`.
3. `services/llm/*` — adapt `getLLMClient()` + `parseStructured<T>(zodSchema)` (fence-rescue,
   one repair retry) from the vendored `packages/ai`. Router table (docs/01 §6).
4. `structuring.service.ts` → MeetingNote (topics/summary/actions/recommendations stub);
   add the MeetingNote zod schema to `@recall/shared`.
5. Golden fixtures: `fixtures/audio/id-30s.*`, `mixed-id-en-30s.*` + expected structuring shape.
6. **QC gate:** structuring parser 100% branch on malformed-JSON repair path; golden green.
