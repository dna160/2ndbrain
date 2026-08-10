# Phase 3e — Delete the Whisper / pyannote / note-generation path (DONE)

**The Plaud migration is complete.** With sync proven end-to-end (3a–3d, verified against real
data), the old self-hosted STT pipeline is removed. This was the one destructive phase; it ran
last, on purpose.

## Deleted (files)
- `services/stt/groqWhisper.ts` (+ test), `services/stt/provider.ts`, `services/stt/diarization.provider.ts`
- `services/transcription.service.ts`, `workers/transcription.worker.ts`
- `services/structuring.service.ts` (+ test), `workers/structuring.worker.ts`
- `fixtures/structuring/` golden fixtures
- The transcription+structuring case in `integration.test.ts`

## Unwired
- **`media.service.ts`**: the `audio → transcription` enqueue is gone. WA media (incl. voice notes)
  is stored to R2, and the pipeline run is closed at `media_stored` (Option C: store, don't
  transcribe). No dangling runs.
- **`routes/v1/uploads.ts`**: `/uploads/complete` is store-only — no transcription enqueue.
- **`routes/v1/pipeline.ts`**: the retry endpoint (which only re-ran STT/structuring) now returns
  409 "automatic retry is no longer supported".
- **`worker.ts`**: transcription/structuring construction + workers removed. `retrieval` stays
  (briefs/digest use it); `enqueuer` stays (shutdown closes it).
- **`constants.ts`**: `QUEUES.transcription` + `QUEUES.structuring` removed. `STAGES.transcribed` /
  `structured` KEPT — the Plaud import reuses those stage names.
- **`config.ts`**: `GROQ_API_KEY`, `STT_LANGUAGE`, `STT_PROMPT`, `DIARIZATION` removed.
- **`prompts.ts`**: `STRUCTURING_SYSTEM` + `buildStructuringUser` removed; digest/consolidation/brief kept.

## Kept (deliberately)
- `transcripts` table + `db/schema/meetings.ts` (Plaud writes transcripts here; historical rows FK'd).
- `diarization_mode` enum (Plaud uses `'plaud'`; `llm`/`pyannote` values are dormant, harmless).
- `packages/shared/schemas/meeting.ts` (`structuringOutput*` is now a dormant contract, not executable).
- `llm/router.ts` + `JOB_TYPES`/`PROMPT_VERSION` `structuring` entries (dormant vocabulary, no code path).

## Data / deploy notes
- **No destructive DDL.** Existing `transcripts` rows stay; historical meetings still render.
- **Config is non-strict** (`z.object`), so it STRIPS unknown env keys rather than erroring. Removing
  `GROQ_API_KEY`/`STT_*`/`DIARIZATION` from config does NOT crash boot even with the Railway vars
  still set. Delete those Railway vars lazily for hygiene (a var-delete doesn't trigger a deploy).
- **Orphaned queue jobs:** any in-flight `recall-transcription`/`recall-structuring` jobs lose their
  consumer on this deploy. Low volume (few WA voice notes pre-Plaud); the audio is stored in R2
  regardless, so no data loss — just no transcription of those.

## Gates
`typecheck`, `lint`, `test` (213 api + 16 web + 10 shared = 239), `build` green.

## Superseded docs (not rewritten — docs/05 is authoritative)
`docs/00-PRD.md` and `docs/01-ARCHITECTURE.md` still describe the old Groq-Whisper + pyannote design
in their narrative sections. docs/05-PRD-PLAUD-SYNC.md + this progress series supersede them; a full
rewrite of those two is cosmetic follow-up.

## Remaining Plaud follow-ups (non-blocking)
- The lean per-participant **recommendation LLM pass** (F2.3) — still deferred.
- WhatsApp **`sync now`** command (internal route covers it operationally).
- A Plaud **end-to-end integration test** to replace the deleted structuring one.
