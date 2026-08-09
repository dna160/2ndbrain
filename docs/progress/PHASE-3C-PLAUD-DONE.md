# Phase 3c — Speaker resolution + meeting rows + stall alert (DONE)

**Shipped:** Plaud imports now produce operator-facing meeting rows with speakers resolved, a
`speaker_aliases` table so recurring speakers stop needing confirmation, and the 48h stall alert
wired to WhatsApp. Verified against real production data in 3b.

## What shipped
- **`speaker_aliases` table** (migration `0003`): `(tenantId, deviceSerial, speakerLabel)` unique →
  `contactId`. Written on confirm, read at import.
- **`SpeakerResolver`** (`services/plaud/speaker.resolver.ts`): `resolveParticipants` auto-confirms
  a speaker label when a known alias exists for the recording's device serial; everyone else is
  left UNCONFIRMED (an unlabeled speaker is honest; a guessed one corrupts the graph — docs/05 §3.6).
  `matchCalendarEvent` links the recording to a calendar event within ±15 min. `distinctSpeakers`
  helper.
- **Meeting-row creation in the import** (`plaud.import.service.ts`, new `structured` stage): title,
  occurredAt, transcriptId, calendarEventId, resolved participants, summary = Plaud notes. Meeting
  id linked back onto `plaud_recordings`. The transcript's real `Speaker N` labels + timestamps make
  this possible (discovered in the 3b reconciliation).
- **Confirm write-back** (`speaker.service.ts`): confirming a speaker now upserts a `speaker_alias`
  keyed by the recording's device serial, so the next import from that device auto-resolves them.
  Reuses the existing `POST /v1/meetings/:id/participants/:speakerKey/confirm` route unchanged.
- **Stall alert** (`alerts.service.ts` `plaudStalled` + `worker.ts` `onStalled`): a recording with no
  transcript past `PLAUD_STALL_ALERT_HOURS` (48h) sends the operator a WhatsApp alert once.

## Gates
`typecheck`, `lint`, `test` (228 api + 16 web + 10 shared = 254), `build` all green. Tests: resolver
(alias hit/miss, no-serial skip, calendar match/no-match), import meeting creation, speaker service
still green with the alias write-back.

## Deferred
- **WhatsApp `sync now` command** — the internal `POST /internal/plaud/sync` route already provides
  a manual trigger (used in production). The WA command couples waSend + operator resolution into
  IngestService and is a small, separate change; deferred deliberately, not forgotten.
- The lean per-participant recommendation LLM pass (F2.3) — Phase 3d.

## Next: 3d (wire memory extraction — likely near-free since events.content is populated) → 3e (delete Whisper).
