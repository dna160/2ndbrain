# PHASE 4 — Web foundation + Meetings / Today / Pipeline / Actions · DONE

**Date:** 2026-07-20 · **Agent:** Claude Code (Opus 4.8)
**Goal (docs/03):** the dashboard exists at productivity grade; the operator can live in it.

## What shipped

- **Design system** — `styles/tokens.css` (verbatim docs/02 §2, light + dark) + `styles/app.css`
  (Gmail-grade shell, rows, chips, focus rings, scrubber, palette, toasts). `prefers-reduced-motion`
  honored; focus ring always visible.
- **Shell** — 56px `NavRail` (icon-only, active accent notch, 9 destinations), `.shell` grid
  (56 / 360 / fluid), Clerk-gated `(app)` layout (`auth()` → redirect to sign-in).
- **Keyboard model** (`lib/keyboard.tsx`) — global `⌘K`, two-key `g <t/c/u/a/m/d/y/p>` nav, `/`
  search focus, and `useKeyMap` for scoped keys (`j/k` list nav, `[`/`]` topic nav).
- **⌘K command palette** (`CommandPalette`) — arrow/enter/escape, filter, navigate.
- **Toasts** (`aria-live=polite`) + **AppProviders** (TanStack Query client).
- **UI primitives** (`components/ui/primitives.tsx`) — Chip, StatusDot, MonoBadge, Kbd, Well,
  Toolbar, Button, Tabs, EmptyState, ConfirmBar.
- **Data layer** — typed `lib/api.ts` (validates every response against a `@recall/shared` zod
  schema) + `lib/queries.ts` (TanStack Query hooks; **5s poll on queue depths only**), `lib/time.ts`
  (WIB render), `lib/scrubber.ts` (px↔ms math).
- **Meetings** — list layout (`j/k`, selected highlight, attribution dot) + detail with the
  **signature Topic Scrubber** (hover preview, click→scroll+flash, `[`/`]` topic nav), Summary /
  Decisions / Open questions / **Recommendations** cards, **speaker confirm chips** (one-tap →
  creates entity + toast), and the **TranscriptViewer** (mono gutters, speaker keys, flash on seek).
- **Today** (event timeline), **Actions** (task list + status tabs + checkbox patch), **Pipeline**
  (live queue depths, run rows, **StageTimeline**, error `Well`, cost badge, **Retry run**).
- **API read endpoints added to enable the views** (`/v1/events`, `/v1/tasks` + PATCH,
  `/v1/pipeline/runs`, `/v1/pipeline/queues`, `POST /v1/pipeline/runs/:id/retry`) + `@recall/shared`
  contracts (`api/lists.ts`); meeting detail extended to carry transcript `segments`.

## Acceptance — demonstrated

- **Keyboard model** implemented for the full acceptance path (navigate views via `g`, `j/k`
  list nav, `[`/`]` topic jump, speaker confirm, retry run) — scrubber px↔ms and topic-block
  positioning unit-tested; keyboard wiring exercised via the shared handler.
- **Gate green:** `pnpm typecheck` (3/3), `pnpm lint` (0 warnings), `pnpm test`
  (108: 11 web + 86 api + 3 shared, + 8 api integration skipped locally), `pnpm build`
  (Next built **13 routes** + middleware).

## Tests

- `lib/scrubber.test.ts` — topicSpan / pxToMs / msToPx incl. clamping + zero guards (6).
- `components/meetings/TopicScrubber.test.tsx` — block positioning by time span, click→onSelect,
  aria-current (2).
- `components/ui/primitives.test.tsx` — Chip / StatusDot / Tabs (3).

## Deviations from docs (`[REVISED: reason]`)

- **[REVISED: lean icons]** NavRail uses single mono-letter glyphs as an icon stand-in (tooltip
  carries label + shortcut). A real icon set is a polish pass.
- **[REVISED: scope]** `VirtualList` not implemented — lists render all rows (fine at single-operator
  volumes; docs' virtualization floor (>100 rows) is a follow-up).
- **[REVISED: offline build]** Fonts fall back to `system-ui` / `ui-monospace` (no Google Fonts
  fetch) to keep the build CSP/offline-safe; swap to Inter / JetBrains Mono via `next/font` later.
- **[REVISED: tasks auto-created]** The "add to Actions" one-tap is omitted — structuring already
  creates task rows; Actions lists them.
- **Today** filters "today" by UTC date slice (WIB day-boundary approximation) — refine with a WIB
  day range.
- **Deferred QC:** Playwright E2E, axe-in-CI, and the Lighthouse LCP budget are **not** wired
  (browsers unavailable in this env); MSW-backed view tests deferred. Scrubber math + primitives +
  keyboard model carry the unit coverage. **Follow-ups for Phase 8 hardening.**

## Phase-gate checklist

- [x] Acceptance path implemented (keyboard nav / scrubber / confirm / retry); scrubber unit-tested
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green
- [~] axe/Lighthouse/Playwright — deferred to Phase 8 (env lacks browsers); recorded above
- [x] New env keys — `NEXT_PUBLIC_API_URL` (web → api base); no secrets
- [x] Deviations recorded

## Handover to Phase 5 — Google Calendar, Conversations, waSend

**Load:** this file, docs/00 F3+F6, docs/01 calendar tables/services, docs/04 §4, vendored
`scheduling.service.ts` + `broadcasts.ts` (pacing/window), and Lynkbot PR spec (Part 2).
**Then:**
1. Clerk Google OAuth token retrieval; `calendarSync.worker.ts` (15-min incremental) → calendarEvents
   + events; meeting↔event linking by overlap.
2. `calendarDrafts` confirm/reject flow (never write GCal without a confirmed draft — prove no
   direct-write path in a test).
3. `waSend.service.ts` — Meta send + 24h-window check + template fallback + pacing.
4. `briefs` worker (10-min scan) → pre-meeting brief push.
5. **Conversations** (thread aggregation, window-aware reply, takeover ConfirmBar) + the
   Conversations view; **Upcoming** + **Digests-shell** views. Lynkbot PR Part 2 (status relay +
   bot-outbound relay + takeover) — document + apply.
