# Phase 3b — Plaud sync loop (DONE)

**Shipped:** the machinery that makes the deployed worker discover Plaud recordings, walk them
through the readiness state machine, and import ready ones into the substrate. Still **dark** —
constructs only when `PLAUD_SYNC_ENABLED=true` AND the three Plaud credentials are set.

## What shipped
- **Tables** (`db/schema/plaud.ts`): `plaud_recordings` (state machine + idempotency ledger,
  unique on tenantId+plaudId) and `plaud_sync_state` (cursor, failure counter, WA-command
  rate-limit). Migration `0002_silent_mulholland_black.sql` — new `plaud_readiness` enum, the two
  `ALTER TYPE ADD VALUE 'plaud'` (event_source, diarization_mode), and both tables. The new enum
  values are NOT used in any DDL in that file, so the single-transaction migration is safe on
  PG18 (ADD-VALUE-in-transaction is allowed when the value isn't used in the same tx).
- **`PlaudImportService`** (`services/plaud/plaud.import.service.ts`): the state machine
  `discovered → awaiting_transcript → ready → ingested`, plus `stalled` (age > PLAUD_STALL_ALERT_HOURS,
  fires `onStalled` once) and content-hash idempotency. A ready import writes an `events` row
  (source='plaud', idempotent on `plaud:<id>` externalId), a `transcripts` row (sttProvider/
  diarizationMode='plaud'), mirrors transcript JSON + notes markdown to R2 (**audio not mirrored**,
  §12.2), and runs inside a `pipeline_runs` run (Plaud is flat-rate → costIdr 0, but the run row
  keeps cost queries total). `events.content` = the notes markdown, so nightly consolidation (3d)
  picks it up.
- **`plaud.worker.ts`**: BullMQ consumer for `recall-plaud-sync` with a 5-min Redis single-flight
  lock per tenant (base poll + adaptive bursts must not double-ingest), DLQ on failure.
- **`plaud.schedule.ts`**: pure `plaudSyncJobsFor(events, now)` — pre-event guard (20 min before
  start) + 15-min bursts across 120 min after end, deterministic jobIds, past firings dropped.
- **`scheduled.worker.ts`**: 2h base repeatable + a 15-min scheduler tick that plans adaptive
  syncs from the calendar. Gated on `plaudEnabled`.
- **`worker.ts`**: constructs the client/auth/import/worker only when the flag + credentials are
  present; logs `[worker] plaud sync ENABLED` or a clear skip warning.

## Gates
`typecheck`, `lint`, `test` (220 api + 16 web + 10 shared = 246), `build` all green. Tests:
state-machine paths (import / awaiting / stalled / idempotent no-op), 2 R2 mirrors not 3, cost
run started, and the pure scheduler (burst math, past-drop, determinism).

## Deferred to 3c / 3d (as planned)
- Speaker → contact resolution (`meetings.participants`, confirm flow) and the meeting-row creation.
- The lean per-participant recommendation LLM pass.
- WA `sync now` command + wiring `onStalled` to real WhatsApp alerts.
- Triggering same-day memory extraction (nightly consolidation already covers it via events.content).

## Deploy notes
- Dark on deploy: `PLAUD_SYNC_ENABLED` defaults false, so nothing runs. The migration applies via
  the api preDeployCommand.
- To turn on later (3-credential gate): set `PLAUD_CLIENT_ID`, `PLAUD_CLIENT_SECRET`,
  `PLAUD_REFRESH_TOKEN` (from `~/.plaud/tokens.json`) and `PLAUD_SYNC_ENABLED=true` on Railway,
  then deploy. Per RAILWAY.md: set vars BEFORE the deploy, and applying vars alone does not deploy.
