# PHASE 5 — Google Calendar, Conversations, waSend · DONE

**Date:** 2026-07-20 · **Agent:** Claude Code (Opus 4.8)
**Goal (docs/03):** calendar in the substrate; drafts confirmable; briefs firing; Conversations
tab live (read + reply).

## What shipped

- **waSend** (`waSend.service.ts` + `meta/send.client.ts`) — Meta send with the **24h window
  check**: in-window → free-form text, out-of-window → approved utility template. Pure
  `isWithinWindow` + `sleep`/`PACING_MS` (~80/min, Lynkbot broadcast pacing).
- **Calendar** (`calendar.service.ts` + `google/calendar.client.ts` + `google/token.ts`) —
  incremental sync (syncToken cursor on `connectedAccounts`; 410 → full resync), overlap
  **conflict detection**, and **DRAFT-GATED writes**: `confirmDraft` is the ONLY method that
  calls Google insert/patch/remove — never auto-book (proven by test). Token via Clerk OAuth.
- **Conversations** (`conversations.service.ts` + `lynkbot.client.ts`) — thread aggregation
  (group-by senderWaId + waContacts join + unread math + All/Personal/Bot filters), messages,
  **window-aware reply** (on a bot-active thread returns `needsConfirm`; with confirm it calls
  `takeover.pause` **before** `waSend.send` — ordering unit-tested), read receipts, takeover
  proxy, and **blockAndPurge** (the ONLY hard-delete path — blacklist purge).
- **Briefs** (`briefs.service.ts`) — 55-65 min scan for events with attendees & no briefSentAt →
  ≤900-char brief (docs/04 §4) → WA push → set briefSentAt (memory hook no-op til Phase 6).
- **Scheduled workers** (`scheduled.worker.ts`) — repeatable calendar-sync (15 min) + briefs-scan
  (10 min), Lynkbot remove-then-add pattern; DLQ on exhaustion (helper loosened for tenant-less jobs).
- **API** — `/v1/calendar/upcoming` (+ conflicts) + draft confirm/reject; `/v1/conversations`
  (threads, messages, window-aware send, read, takeover POST/DELETE, block+purge). Contracts in
  `@recall/shared` (`calendar.ts`, `conversations.ts`).
- **Web** — **Conversations** (filter tabs, thread list with unread + Bot-active chip, thread
  view with Assistant chips, reply composer with `r`/⌘⏎ and the takeover **ConfirmBar**) and
  **Upcoming** (agenda with conflict bars + draft confirm/reject via `c`/`x`).
- **Config** — promoted `META_PHONE_NUMBER_ID` + `LYNKBOT_INTERNAL_URL` to required; added
  `WA_UTILITY_TEMPLATE`.
- **Lynkbot PR Part 2** documented (`docs/lynkbot-pr/phase-5-takeover.md`) — status relay +
  bot-outbound relay + takeover endpoint (separate repo; spec only).

## Acceptance — demonstrated (unit)

- **Window fallback both branches:** in-window→text, out-of-window→template, no-history→template.
- **Calendar draft-gate:** confirmDraft(create/update/cancel) → insert/patch/remove; not-proposed
  → throws; **sync + createDraft + rejectDraft never touch the Google client** (no direct-write).
- **Conversations:** bot-active + no confirm → `needsConfirm`; confirm → **pause-before-send**;
  non-bot → send + outbound persisted; **blockAndPurge** deletes events + stamps purgedAt.
- **Gate green:** `pnpm typecheck` (3/3), `pnpm lint` (0 warnings), `pnpm test`
  (119: 105 api + 11 web + 3 shared, +8 api integration skipped), `pnpm build` (Next routes clean).

## QC gate — coverage

vitest per-file **100%** on `services/waSend.service.ts` (window fallback both branches) — plus
all prior gated files. Calendar write-path branches (confirmDraft create/update/cancel + guard)
and the no-direct-write proof are covered by unit tests.

## Deviations / notes

- **CI-only acceptance:** the live integration scenarios (GCal event appears ≤15 min; draft
  confirm creates a real event; reply arrives on WhatsApp; brief arrives) require real Google/Meta
  + Redis and are **not** runnable here. Logic is unit-tested + typechecked; end-to-end belongs to
  Phase 8 against seeded/mocked externals. The "purge → zero residual rows" assertion is proven by
  construction (unconditional delete on senderWaId) + unit-asserted; a DB-level zero-residual
  integration test is a Phase 8 follow-up.
- **Thread aggregation** uses a Postgres `count(... ) filter` group-by — exercised against real DB
  in CI, not the fake-db unit suite.
- **Google token** via Clerk `getUserOauthAccessToken('oauth_google')`; requires the operator to
  connect Google in Clerk (OAuth scopes configured in the Clerk dashboard).
- **Meeting↔calendar linking** by overlap is light (calendar events upserted into the substrate);
  richer linking can follow.

## Phase-gate checklist

- [x] Acceptance path implemented; window + draft-gate + takeover-order + purge unit-tested
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green
- [x] Calendar-write path draft-gated + no-direct-write proven; window both branches 100%
- [x] New env keys added (`META_PHONE_NUMBER_ID`, `LYNKBOT_INTERNAL_URL` required; `WA_UTILITY_TEMPLATE`)
- [x] Deviations recorded; Lynkbot PR Part 2 documented
- [~] Live integration scenarios → Phase 8 (env lacks Google/Meta/Redis)

## Handover to Phase 6 — Memory: graph, consolidation, retrieval, review

**Load:** this file, docs/00 F4, docs/01 memory tables + §6, docs/04 §3, vendored genome EMA
pattern (`intelligence.ts`), `embeddings.ts`.
**Then:**
1. `graph.service.ts` (entity CRUD, aka-resolution, link upsert w/ strength EMA, neighborhood via
   recursive CTE ≤2 hops, cap 40).
2. `embeddings.ts` provider (BGE-M3, 1024-dim — matches the schema) + backfill.
3. `consolidation.service.ts` (nightly 20:30) — day's events → facts + relations (deepseek), embed
   dedupe (≥0.88 merge EMA; 0.75-0.88 + contradiction → review; new <0.6 → review), salience decay,
   T3 nominations. Input compaction (personal full-fidelity; commerce pre-summarized; ~60k cap).
4. `retrieval.service.ts` (`contextFor`) — T3 + neighborhoods + hybrid top-k + T1; sensitivity
   filter. **Wire into structuring recommendations + briefs** (the no-op hooks already exist).
5. **Memory** view: GraphView (d3-force), entity pages w/ provenance links, ReviewQueue (`c`/`x`/edit).
6. **QC:** memory-write paths 100%; retrieval determinism; no memory row without provenance.
