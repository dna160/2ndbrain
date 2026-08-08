# Phase 3a — Plaud adapter (DONE)

**Shipped:** a typed, tested Plaud personal-data client with refresh-token auth and a zod
boundary. Purely additive and dark — no queue wiring, no live-code change, nothing runs until
`PLAUD_SYNC_ENABLED` flips in Phase 3b.

## What shipped
- `packages/shared/src/schemas/plaud.ts` — zod contracts grounded in docs/05 Appendix A:
  `plaudFileSummarySchema`, `plaudFileListSchema`, `plaudFileDetailSchema`, `plaudSegmentSchema`,
  `plaudTokenResponseSchema`, the `plaudReadinessSchema` state enum, and `plaudNotesMarkdown()`.
  Exported from the schema barrel. `duration` normalized as ms at the boundary.
- `apps/api/src/services/plaud/plaud.auth.ts` — `createPlaudTokenProvider`: refresh→access
  exchange, in-memory cache, proactive refresh at 50% lifetime, `PlaudAuthError` on failure
  (typed so 3b can treat it as P1-halt, not retry-forever). No token material on disk/logs.
- `apps/api/src/services/plaud/plaud.client.ts` — `PlaudClient` interface + `HttpPlaudClient`
  (`listFiles`, `getFile`), `PlaudSchemaError` on drift, `toTranscriptSegments()` normalizer to
  the persisted `TranscriptSegment` shape.
- `apps/api/src/config.ts` — `PLAUD_*` keys, all optional/defaulted (dark). `.env.example` updated.
- `fixtures/plaud/` — `list_files.json`, `get_file_ready.json` (ID/EN code-switched, with
  source_list + note_list), `get_file_not_ready.json`.
- Tests: `plaud.client.test.ts` (8), `plaud.auth.test.ts` (6), incl. schema-drift → `PlaudSchemaError`,
  401 → `PlaudAuthError` (no stale cache), and refresh-token-never-in-URL.

## Gates
`typecheck`, `lint`, `test` (209 api + 16 web + 10 shared), `build` all green. Fixed a pre-existing
`ingest.service.ts` branch-coverage gap (the `senderName` ternary from the profile-name feature was
only tested on the null side) — added a with-contact ingest test.

## Deviations / notes for 3b
- Endpoint field names follow Appendix A and are **fixture-driven guesses** — the endpoints are
  undocumented. Correct `plaud.ts` against a real recorded payload, and stand up the CI
  contract-drift canary (docs/05 §10) before relying on this in production.
- `note_list` modeled as `string | string[]`; `plaudNotesMarkdown()` normalizes to one string.
- Segment `start`/`end` assumed ms (matches `duration`). Verify against a real transcript; the
  normalizer is the one place to fix if they turn out to be seconds.
- Coverage gate scope (`vitest.config.ts` include list) was NOT extended to the Plaud client/auth,
  consistent with how thin adapters (Google client, etc.) are treated — they're covered by their
  own unit tests, not the global business-core gate.

## Next: Phase 3b — sync loop (queue, worker, tables, readiness state machine, adaptive polling).
Still dark behind the flag. See docs/progress/PLAUD-MIGRATION-PLAN.md.
