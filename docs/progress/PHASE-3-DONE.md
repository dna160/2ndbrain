# PHASE 3 — Transcription + structuring (the Plaud replacement) · DONE

**Date:** 2026-07-20 · **Agent:** Claude Code (Opus 4.8)
**Goal (docs/03):** audio in → complete Meeting Note out (topics+timestamps, summary, actions,
recommendations stub, speaker suggestions).

## What shipped

- **STT** — `stt/provider.ts` interface; `groqWhisper.ts` (Whisper-large-v3, verbose_json →
  ms segments, verbatim, multilingual); `diarization.provider.ts` (interface + `NoopDiarization`
  single-speaker; `getDiarizationProvider('pyannote')` **throws NotImplemented** — scaffold only,
  gated on the <70% attribution metric, docs/01 ADR-3).
- **LLM stack** (adapted from vendored `packages/ai`) — `llm/types.ts` (LlmClient),
  `llm/deepseek.ts` (OpenAI-compatible, split token usage), `llm/parse.ts`
  **`parseStructured<T>`** (fence-rescue + zod-validate + **one repair retry feeding the zod
  error back verbatim**), `llm/router.ts` (jobType→model + temperatures, cost tier),
  `llm/prompts.ts` (docs/04 §1 structuring system + user builder).
- **Transcription** — `transcription.service.ts` (STT + diarization → transcript, `transcribed`
  stage + sttSeconds metering) and `transcription.worker.ts` (R2 download → transcribe →
  enqueue `structuring`).
- **Structuring** — `structuring.service.ts` (single deepseek-reasoner pass →
  `structuringOutputSchema`, persists the `meetings` row + one `tasks` row per action,
  EN-normalized; `structured` stage + token metering; **retrieval hook present, no-op until
  Phase 6**) and `structuring.worker.ts` (→ `persisted` → completeRun).
- **Speaker** — `speaker.service.ts` (confirm → create/link person entity, mark participant
  confirmed) + `POST /v1/meetings/:id/participants/:speakerKey/confirm`.
- **Meetings API** — `routes/v1/meetings.ts` (list, detail, confirm), contracts in
  `@recall/shared` (`meeting.ts`: structuringOutput + meeting list/detail + confirm request).
- **Shared DLQ handler** — `workers/dlq.ts` (`onFailedToDlq`) now used by all three workers.
- **Wiring** — `worker.ts` runs media + transcription + structuring workers; `app.ts` registers
  meetings under `/v1`. Config promoted `GROQ_API_KEY`, `DEEPSEEK_API_KEY` to required; added
  `DIARIZATION=none|pyannote`. R2Client gained `get()`.
- **Golden fixtures** — `fixtures/structuring/mixed-id-en-30s.{transcript,expected}.json`.

## Acceptance — demonstrated

- **Unit (43 new; 86 total pass):** `parseStructured` (valid/fenced/repair-success/schema-repair/
  repair-fail-throw), Groq STT mapping (mocked fetch), **structuring golden** (canned LLM output
  → meeting shape + one task per action + title + attributionConfidence + token metering),
  speaker confirm (existing entity / new entity / not-found / no-id).
- **Integration (testcontainers, CI):** audio → `transcription.transcribe` → `structuring.structure`
  against real Postgres (STT/LLM mocked) → **meeting persists with ≥1 topic, topics within audio
  duration, one task per action, pipeline run stages ingested→transcribed→structured→persisted,
  costIdr > 0**; `GET /v1/meetings` lists it; speaker confirm returns 200. *(8 integration cases
  skip locally — no Docker — run in CI.)*
- **Gate green:** `pnpm typecheck` (3/3), `pnpm lint` (0 warnings), `pnpm test` (94: 86 pass +
  8 integration skipped), `pnpm build` (3/3).

## QC gate — coverage

vitest per-file **100%** on `services/llm/parse.ts` (malformed-JSON repair path) — plus all
prior gated files (ingest idempotency, auth, pipeline, relay HMAC, extract). Golden green.

## Deviations / notes

- **Recommendations** are transcript-only (per plan); the `retrieval` hook is wired but no-op
  until Phase 6 injects memory context.
- **Speaker attribution** is the LLM's job in structuring (docs/04 §2); `NoopDiarization` yields
  a single turn and transcripts record `diarizationMode='none'`. A dedicated attribution pre-pass
  (deepseek-chat) can be added if the golden shows poor turn separation.
- **Real audio bytes** aren't committed — the golden operates at the transcript→structuring layer
  (Groq is mocked in unit tests, injected-mock STT in the integration test). A real short audio
  clip can be added later to exercise Groq live in a manual/e2e run.
- **`languageConfidence`** is set to 1 (Whisper verbose_json exposes no per-language score).

## Phase-gate checklist

- [x] Acceptance demonstrated (unit + golden locally; full pipeline integration in CI)
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green
- [x] Structuring parser 100% branch on the repair path (vitest threshold)
- [x] New env keys added to registry (`GROQ_API_KEY`, `DEEPSEEK_API_KEY` required; `DIARIZATION`)
- [x] Deviations recorded
- [x] Golden fixtures added (transcript + expected structuring)

## Handover to Phase 4 — Web foundation + Meetings / Today / Pipeline / Actions

**Load:** this file, docs/02 (entire design system), docs/01 §7 contracts, `@recall/shared`.
**Then:**
1. Tokens (`styles/tokens.css`), shell (NavRail/ListPane/DetailPane), keyboard system, ⌘K
   palette, primitives (docs/02 §6). Clerk-gated `(app)` route group.
2. Typed `lib/api.ts` from `@recall/shared` + TanStack Query; 5s poll on pipeline depths only.
3. **Meetings** view incl. TranscriptViewer + **TopicScrubber** (signature element), speaker
   confirm chips, add-action one-tap — consume the meeting detail contract already shipped.
4. **Today**, **Actions**, **Pipeline** (StageTimeline, error well, retry, cost badges).
5. QC: axe clean; Lighthouse LCP < 2.0s on meetings list; RTL + MSW view tests; Playwright
   upload→(mock pipeline)→meeting renders→confirm speaker.
