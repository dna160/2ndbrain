# PHASE 7 — Nightly digest · DONE

**Date:** 2026-07-20 · **Agent:** Claude Code (Opus 4.8)
**Goal (docs/03):** the 21:00 WIB ritual, end to end.

## What shipped

- **`digest.service.ts`** — day's events + open tasks + tomorrow's calendar + `retrieval.contextFor`
  → `parseStructured<digestOutputSchema>` (deepseek-reasoner, docs/04 §5) → persist `digests`
  (unique per tenant/date, upsert) → **pure `renderDigest`** (WIB, section headers, ≤1600 chars,
  truncate with dashboard link) → **window-aware `waSend`** (freeform/template) → `deliveredVia`
  + `windowState` recorded → **"recommend booking" → confirmable calendar draft** (never auto-book).
  `resend` re-renders + re-sends a stored digest.
- **Provenance is non-negotiable** — every digest item schema requires `provenanceEventIds.min(1)`
  (an unsourced item fails validation).
- **Cron** — nightly digest (21:00 WIB = `0 14 * * *` UTC) added to the repeatable workers.
- **API** — `/v1/digests` (list), `/v1/digests/:id` (detail), `POST /v1/digests/:id/resend`. Contracts
  in `@recall/shared` (`digest.ts`).
- **Web** — **Digests** view (list by date + `deliveredVia` chip, section detail, **Re-send to
  WhatsApp**).

## Acceptance — demonstrated (unit)

- `renderDigest` renders all five sections + caps at 1600 chars.
- `run` persists the digest, sends **free-form in-window** (`deliveredVia=freeform`) / **template
  out-of-window** (`deliveredVia=template`), and **drafts the booking recommendation**
  (`createDraft` with `sourceType:'digest'`).
- Digest schema **rejects an item with empty provenance**.
- **Gate green:** `pnpm typecheck` (3/3), `pnpm lint` (0 warnings), `pnpm test`
  (137: 123 api + 11 web + 3 shared, +8 api integration skipped), `pnpm build` (Next routes clean).

## Deviations / notes

- **Live delivery** (a real digest arriving on WhatsApp) needs Meta/Redis → the both-delivery-branch
  E2E is unit-tested here; the live path lands in Phase 8. `windowState` is stored; the digest
  claims→provenance guarantee is schema-enforced + tested.
- Digest is generated in the worker (cron); the api exposes list/detail/re-send.

## Phase-gate checklist

- [x] Acceptance path implemented; render + orchestration + provenance + both delivery branches tested
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green
- [x] Digest claims→provenance enforced; delivery branches tested
- [x] Deviations recorded

## Handover to Phase 8 — Hardening, E2E, deploy runbook

**Load:** this file, the QA plan (docs/03 Phase 8), docs/01 §8.
**Then (the parked debt finally lands):**
1. Full Playwright journey (ingest→meeting→confirm speaker→consolidate→digest→draft confirm)
   against a seeded testcontainers stack with mocked externals; wire **axe** + **Lighthouse LCP**
   budgets into CI (deferred from Phase 4).
2. Live-ish integration for the Phase 5/6/7 external paths (Google/Meta/Redis mocked or seeded):
   GCal event appears, draft confirm creates an event, reply/brief/digest deliver, purge → zero
   residual rows.
3. Load test (20 concurrent voice ingests, k6 — no drops, DLQ empty); chaos (kill worker
   mid-transcription → resume); security authz matrix (every `/v1` route × unauthed/wrong-tenant),
   HMAC replay, presign expiry.
4. Railway deploy runbook + rollback (additive-only migrations until v1.1); DLQ-depth>0 → WA alert.
