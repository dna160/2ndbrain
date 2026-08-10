# Phase 3d — Wire Plaud imports into memory extraction (DONE)

**Shipped:** Plaud-imported meetings now feed the nightly graph-memory consolidation, closing the
loop from meeting → transcript → notes → facts/relations in the graph. Small change, load-bearing.

## The finding
Consolidation reads `events` with no source filter, so Plaud events (`source='plaud'`,
`content = notes markdown`) were already eligible — EXCEPT it filtered on `events.occurredAt >=
now-24h`. Plaud events set `occurredAt = the recording's start_at`, which is often days old (a
meeting from 08-04 imported on 08-09). So freshly-imported historical meetings were silently
dropped from consolidation and never entered memory.

## The fix
`consolidation.service.ts` now filters on `events.createdAt` (arrival time) instead of
`occurredAt` (event time). Semantically correct for everything: consolidation processes events
that *arrived* in the window. WA/calendar events have `occurredAt ≈ createdAt`, so it's a no-op
for them; Plaud is the case it fixes. `occurredAt` is still passed to the LLM as each fact's
timestamp, so the meeting's real time is preserved in the extracted facts.

## Provenance (non-negotiable, verified by construction)
The Plaud event id is passed into the consolidation input; extracted facts reference it as
`sourceEventIds`, which become the memory's `provenanceEventIds`. The event's `raw` carries
`{plaudId, name}`, so a memory traces back: memory → event → plaudId → R2 transcript/notes.

## Gates
`typecheck`, `lint`, `test` (229 api + 16 web + 10 shared = 255), `build` green. The filter column
is only observable against a real DB (the unit fake ignores `where`); the CI testcontainer
integration path exercises the real query.

## Deferred (the F2.3 decision)
The **lean per-participant recommendation LLM pass** over the Plaud transcript + retrieval context
(the "keep recommendations" choice from §12) is still outstanding — it's a separable DeepSeek call
with its own prompt/cost/tests. Do it alongside or after 3e.

## Next: 3e — delete the old Whisper / pyannote / note-gen path (destructive; Plaud now proven end-to-end).
