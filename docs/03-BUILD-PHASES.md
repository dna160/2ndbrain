# 03 — Build Phases (Claude Code Execution Plan)

Nine phases, each sized to a coherent context window. Work strictly in order. A phase is DONE
only when its acceptance criteria pass, its QC gate is green, and `docs/progress/PHASE-N-DONE.md`
is written. Never start Phase N+1 with Phase N's gate red.

Per-phase structure: **Goal · Context to load · Tasks · Acceptance criteria · QC gate · Tests required.**

---

## Phase 0 — Scaffold & CI

**Goal:** runnable monorepo, deploy skeleton, CI green on empty project.
**Context to load:** CLAUDE.md, 01-ARCHITECTURE §2, §8.
**Tasks:**
1. pnpm workspace + turbo; `apps/api` (Fastify, tsx dev), `apps/web` (Next 14, Clerk
   provider wired but pages stubbed), `packages/shared` (zod, exports pattern).
2. `config.ts` zod env parsing, fail-fast with named missing keys.
3. Dockerfiles + `infra/railway.json` (api / worker / web services; worker = same api image
   with `MODE=worker` running `worker.ts`).
4. `.github/workflows/ci.yml`: install → typecheck → lint → test → build, pnpm cache.
5. `fixtures/` directory with README describing required fixtures (added Phase 2/3).
**Acceptance:** `pnpm dev` boots api (health route) + web (sign-in page); CI green.
**QC gate:** all commands in CLAUDE.md pass.
**Tests:** config parsing (missing/invalid env → named failure).

---

## Phase 1 — Database, tenancy, auth, pipeline ledger

**Goal:** full schema migrated; Clerk-authenticated API; pipeline logging service.
**Context to load:** 01-ARCHITECTURE §4, §7 (auth), Lynkbot `migrate.ts` + `internalApiKey.ts`.
**Tasks:**
1. Drizzle schema per §4, one file per domain; migration 0001 enables `pgvector` + ivfflat
   index on `memories.embedding`.
2. Dedupe migrate runner; `pnpm db:migrate`, `pnpm db:seed` (tenant + operator user + own
   waId in waContacts, labeled 'Operator').
3. Clerk auth plugin: verify JWT (backend SDK), resolve clerkUserId→tenantId (5-min cache),
   decorate `request.auth`. Internal routes use deduped `internalApiKey`.
4. `pipeline.service.ts`: `startRun(jobType, ref)`, `stage(runId, name, fn)` (wraps, times,
   records ok/err), `meterCost(runId, {sttSeconds?, tokensIn?, tokensOut?})` with IDR
   computation from a rates constant in `shared/constants.ts`.
5. Routes: `GET /internal/health` (db+redis ping), `/v1/settings/blacklist` +
   `/v1/settings/contacts` CRUD on `waContacts`.
**Acceptance:** authed request round-trips tenantId; unauthed `/v1/*` → 401; pipeline run
row shows ordered stages with latencies in a test.
**QC gate:** coverage on auth guard + pipeline service = 100%.
**Tests:** schema constraint tests (unique externalId, link uniqueness), auth (valid/expired/
missing/cross-tenant), pipeline stage failure capture.

---

## Phase 2 — Ingestion: Lynkbot relay → event store → R2

**Goal:** any inbound WA message/voice note becomes an `events` row with media in R2, fully
stage-logged. **Includes the Lynkbot-side PR.**
**Context to load:** 01-ARCHITECTURE §3.3, §3.4 relay spec; Lynkbot `routes/webhooks/meta.ts`
(idempotency pattern), `middleware/metaSignature.ts` (HMAC shape reference).
**Tasks:**
1. **Lynkbot PR part 1 (separate repo, ~90 LOC):** post-idempotency-insert → enqueue
   `relay.forward` → HMAC POST **all** inbound to Recall (no filtering); personal-contacts
   list → `skipAI:true`. Tests: every inbound relayed; personal contact → no AI reply;
   commerce buyer → bot flow unchanged + still relayed.
2. Recall `relayHmac.ts` middleware (timing-safe compare).
   **Blacklist gate in `/ingest/wa`:** upsert `waContacts` on first sight; if
   `blocked=true` → increment drop counter (metrics only), return 200, persist nothing.
   Test: blocked sender leaves zero rows in events/mediaAssets.
3. `POST /ingest/wa`: verify HMAC → parse Meta payload (reuse extraction shape) → idempotent
   insert on `events.externalId` → 200 early-return on duplicate → enqueue `media` job when
   media present, else mark `persisted`.
4. `media.worker.ts`: fetch Meta media URL (short-lived — fetch immediately), stream to R2,
   create `mediaAssets`, sha256 dedupe, stage `media_stored`; audio types enqueue
   `transcription`.
5. Upload path: `POST /v1/uploads/presign` (R2 presigned PUT, 15-min) + `/complete` →
   `events` row (source=upload) → same media/transcription flow.
6. Fixtures: `fixtures/relay/meta-text.json`, `meta-voice.json`, real ~30s test audio.
**Acceptance:** replaying the voice fixture twice yields one event, one media asset, one
pipeline run reaching `media_stored`; duplicate returns 200 with no new rows.
**QC gate:** ingestion idempotency coverage 100%; DLQ test (poisoned payload lands in DLQ,
visible via internal route).
**Tests:** HMAC (valid/invalid/replayed), extraction (text/voice/document/image), R2 failure
→ retry → DLQ, presign flow.

---

## Phase 3 — Transcription + structuring (the Plaud replacement)

**Goal:** audio in → complete Meeting Note out (topics+timestamps, summary, actions,
recommendations stub, speaker suggestions).
**Context to load:** 00-PRD F2, 01 §5–6, 04-PROMPTS §1–2, STT/diarization interfaces §2 filetree.
**Tasks:**
1. `stt/provider.ts` interface: `transcribe(r2Key) → {language, languageConfidence, segments:
   [{startMs,endMs,text}], words?}`. `groqWhisper.ts` implements (whisper-large-v3,
   verbatim, ID/EN). `diarization.provider.ts`: interface + `NoopDiarization` returning
   single-speaker turns. **Do not build pyannote.** Wire selection by env
   `DIARIZATION=none|pyannote` (pyannote value throws NotImplemented with pointer comment).
2. `transcription.worker.ts`: download from R2 → STT → persist transcript → meter sttSeconds
   → stage `transcribed` → enqueue `structuring`.
3. `structuring.service.ts` (DeepSeek via `parseStructured<MeetingNoteSchema>`): single
   reasoning pass over timestamped segments producing topics (title/startMs/endMs/subnotes),
   summary, decisions, next actions (owner/deadline as stated), open questions, speaker
   attribution (`speakerKey→suggestedName+confidence+evidence`), attributionConfidence,
   language handling per CLAUDE.md. Tasks rows created from actions (EN-normalized).
   Recommendations: v-lean here — generated from transcript context only; memory injection
   arrives in Phase 6 (leave the retrieval hook in place, no-op for now).
4. `speaker.service.ts`: persist suggestions on `meetings.participants`;
   `POST /v1/meetings/:id/participants/:speakerKey/confirm {entityId|newEntityName}` →
   creates/links person entity, stores mapping for future auto-resolve (waId/name heuristics).
5. Meetings API: list/detail per contract.
6. Golden test: `fixtures/audio/mixed-id-en-30s.*` → snapshot expected structure (topic count,
   action extraction, language fields). Deterministic assertions on shape + key facts, not
   exact prose.
**Acceptance:** WA voice fixture → completed meeting with ≥1 topic, timestamps within audio
duration, tasks created, pipeline run `ingested→…→persisted` with cost metered.
**QC gate:** structuring parser 100% branch coverage on malformed-JSON repair path; golden green.
**Tests:** STT provider (mock HTTP), structuring schema validation + repair retry, worker
failure at each stage → correct pipeline_runs state, speaker confirm flow.

---

## Phase 4 — Web foundation + Meetings, Today, Pipeline, Actions views

**Goal:** the dashboard exists at productivity grade; the operator can live in it.
**Context to load:** 02-DESIGN-SYSTEM (entire), 01 §7 contracts, shared schemas.
**Tasks:**
1. Tokens, shell (NavRail/ListPane/DetailPane), keyboard system, ⌘K palette, primitives
   inventory (02 §6). Clerk-gated `(app)` group.
2. Data layer: typed `lib/api.ts` from shared schemas + TanStack Query; 5s polling on
   pipeline queue depths only.
3. **Meetings** view incl. TranscriptViewer + **TopicScrubber** (signature element — build it
   properly: hover preview, click-to-scroll+flash, audio seek when media present),
   speaker confirm chips, add-action one-tap.
4. **Today**, **Actions**, **Pipeline** (StageTimeline, error well, retry, cost badges) per 02 §5.
5. Empty states + error states per UX writing rules.
**Acceptance:** keyboard-only pass: navigate views, open meeting, jump topics with `[`/`]`,
confirm a speaker, retry a failed run — no mouse.
**QC gate:** axe clean on all four views; Lighthouse LCP <2.0s on meetings list (CI budget);
component coverage per QA plan.
**Tests:** vitest+RTL for primitives/scrubber math (px↔ms mapping), MSW-backed view tests,
Playwright E2E: upload→(mock pipeline)→meeting renders→confirm speaker.

---

## Phase 5 — Google Calendar, Conversations, waSend

**Goal:** calendar in the substrate; drafts confirmable; briefs firing; **Conversations tab
live (read + reply)** — it ships in this phase because replying depends on waSend.
**Context to load:** 00-PRD F3+F6, 01 calendar tables/services, 04-PROMPTS §4, Lynkbot
`scheduling.service.ts` (pattern reference), `waSend` spec.
**Tasks:**
1. Clerk Google OAuth token retrieval; `calendarSync.worker.ts` 15-min incremental sync
   (syncToken cursor on `connectedAccounts`) → `calendarEvents` + `events` rows; meeting↔
   event linking by time overlap + attendee match.
2. `calendarDrafts` flow: create (from digest/meeting/manual) → confirm applies via Google
   API → `appliedAt`; reject archives. Never write GCal without a confirmed draft.
3. `waSend.service.ts`: Meta send + **24h-window check** (last inbound from operator's waId)
   → freeform or approved template fallback; pacing per Lynkbot broadcast pattern; register
   the utility template ("daily brief ready") — document template submission in DONE file.
4. `briefs` worker (10-min scan): events starting in 55–65 min with attendees → brief prompt
   (memory hook, Phase 6 enriches) → WA push, `briefSentAt` set.
5. **Conversations:** `GET /v1/conversations` (thread aggregation query over events grouped
   by senderWaId, joined to waContacts labels + botActiveUntil, unread from `readAt`,
   filter tabs All/Personal/Bot-handled), thread messages
   endpoint (cursor pagination, 50/page), `POST .../messages` → waSend (window-aware, both
   modes) → persist outbound event (direction=outbound) → return delivery state; read
   receipts endpoint. Relay note: Meta delivery-status callbacks for Recall-sent messages
   arrive at Lynkbot's webhook — **Lynkbot PR part 2 (~60 LOC):** forward all status
   updates; relay the bot's own outbound sends (marked `origin:'lynkbot_bot'`, rendered as
   assistant messages in threads); add `POST/DELETE /internal/brain/takeover` (suppress bot
   for waId until expiry).
   **Takeover flow:** Recall `POST /v1/conversations/:waId/takeover` proxies Lynkbot's
   endpoint; ConfirmBar on first reply to a bot-active thread; Resume action.
   Blacklist-from-thread endpoint with optional history purge (hard-delete events+media
   for that waId, log purgedAt).
6. **Conversations view** per design spec (ThreadRow, MessageBubble, ReplyComposer with
   template-fallback mode, unread badges, `r`/`⌘enter` keys).
7. **Upcoming** + **Digests-shell** views; draft confirm/reject with `c`/`x`.
**Acceptance:** created GCal event appears in Upcoming ≤15 min; conflicting events flagged;
draft confirm creates real GCal event; brief arrives on WA for a test event; a reply sent
from the dashboard arrives on the contact's WhatsApp and appears in the thread as an
outbound event; composing outside the 24h window forces template mode.
**QC gate:** calendar-write path coverage 100% (draft-gated — prove no direct-write path
exists via test); window-fallback both branches tested.
**Tests:** sync cursor (fresh/incremental/invalidated token), overlap conflict detection,
draft state machine, window check (inside/outside/no-history), thread aggregation +
unread math + filter tabs, reply send (success/window-blocked/Meta error → inline failure),
takeover (pause called before send on bot-active thread; resume; expiry), blacklist purge
(zero residual rows), outbound event persistence incl. bot-origin messages (consolidation
must see all directions — assert in a Phase 6 fixture).

---

## Phase 6 — Memory: graph, consolidation, retrieval, review

**Goal:** the second brain's brain. Entities+links+memories live; nightly consolidation;
retrieval injected into structuring recommendations + briefs; review queue in UI.
**Context to load:** 00-PRD F4, 01 memory tables + §6, 04-PROMPTS §3, Lynkbot genome EMA
pattern (reference), `embeddings.ts`.
**Tasks:**
1. `graph.service.ts`: entity CRUD, aka-resolution, link upsert (unique from/to/relation,
   strength EMA), neighborhood via recursive CTE (depth ≤2, salience-ordered, cap 40 nodes).
2. `embeddings.ts` provider; backfill command for existing content.
3. `consolidation.service.ts` (nightly 20:30 WIB): day's events → candidate facts + relations.
   **Input compaction (full-inbox volume control):** personal-contact threads + meeting
   summaries pass at full fidelity; commerce buyer threads are pre-summarized one-line-per-
   thread (deepseek-chat) before entering the consolidation prompt; hard cap ~60k tokens
   input, overflow ranked out by thread recency+volume →
   (DeepSeek, 04-PROMPTS §3) → embedding dedupe (cosine ≥0.88 → merge, EMA confidence;
   0.75–0.88 + semantic contradiction → `memoryReviews[contradiction]`; new → insert,
   confidence <0.6 → `memoryReviews[low_confidence]`) → link strengths updated with
   provenance → salience decay (×0.98 daily, floor 0.05, `lastAccessedAt` refresh on
   retrieval) → T3 nominations (recurrence ≥3 sources) → review rows.
4. `retrieval.service.ts`: `contextFor({entityIds?, query?, occurredAt?})` → T3 core + entity
   neighborhoods + hybrid top-k (vector+keyword, recency-weighted) + T1 window; sensitivity
   filter parameter (briefs/digests exclude `sensitive` unless entity-scoped view). Wire into
   structuring recommendations (per-participant context) and briefs.
5. **Memory** view: GraphView (d3-force), entity pages with provenance links ("why does it
   believe this" → source event/transcript deep-link), ReviewQueue with `c`/`x`/edit,
   core-memory editor.
**Acceptance:** after consolidating a seeded day: entities+links exist with provenance; a
contradictory fact lands in review not in active memory; recommendations in a new meeting
reference a known commitment of a participant; graph renders and navigates.
**QC gate:** memory-write paths coverage 100%; retrieval determinism test (fixed fixtures →
stable ranking); no memory row without provenance (constraint test).
**Tests:** EMA merge math, dedupe thresholds, decay, CTE walk caps, sensitivity filtering,
review resolutions.

---

## Phase 7 — Nightly digest

**Goal:** the 21:00 WIB ritual, end to end.
**Context to load:** 00-PRD F5, 04-PROMPTS §5, digest table, waSend.
**Tasks:** digest worker (cron-seeded per deduped pattern): day's events + open tasks +
tomorrow's calendar + retrieval context → DeepSeek digest JSON (sections per PRD; every claim
carries provenanceEventIds) → persist → render WA text (WIB, concise) → window-aware send →
draft rows for "recommend booking" items. **Digests** view completed; re-send action.
**Acceptance:** seeded day produces digest with all five sections, delivered (or template
fallback) with `deliveredVia` recorded; recommended booking appears as confirmable draft.
**QC gate:** digest claims→provenance test; both delivery branches E2E.

---

## Phase 8 — Hardening, E2E, deploy runbook

**Goal:** production confidence.
**Context to load:** QA plan (this doc + CI), 01 §8.
**Tasks:** full Playwright journey (ingest→meeting→confirm speaker→consolidate→digest→
draft confirm) against a seeded stack (testcontainers postgres+redis, mocked externals);
load test: 20 concurrent voice ingests (k6) — no drops, DLQ empty; chaos: kill worker
mid-transcription → run resumes/retries correctly; security pass: authz matrix (every /v1
route × unauthed/wrong-tenant), HMAC replay, presign expiry; Railway deploy runbook +
rollback (previous image + migration policy: additive-only until v1.1); alert: DLQ depth >0
→ WA notification to operator via waSend.
**Acceptance:** journey E2E green in CI; runbook executed once for real (staging→prod).
**QC gate:** global coverage targets met; zero criticals from security pass.

---

## Phase-gate checklist (copy into every PHASE-N-DONE.md)

- [ ] All acceptance criteria demonstrated (state how)
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green
- [ ] Coverage targets met (paste summary)
- [ ] New env keys added to registry + Railway
- [ ] Deviations from docs recorded with `[REVISED: reason]`
- [ ] Golden fixtures updated? If yes, justification written
