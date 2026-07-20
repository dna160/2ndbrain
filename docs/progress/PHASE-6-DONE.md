# PHASE 6 — Memory: graph, consolidation, retrieval, review · DONE

**Date:** 2026-07-20 · **Agent:** Claude Code (Opus 4.8)
**Goal (docs/03):** the second brain's brain — entities+links+memories; nightly consolidation;
retrieval injected into structuring recommendations + briefs; review queue.

## What shipped

- **Memory math** (`memory/math.ts`, **100% gated**) — `emaMerge`, `cosineSimilarity`,
  `classifyDedupe` (≥0.88 merge / 0.75-0.88+contradict / insert), `decaySalience` (×0.98, floor
  0.05), `needsReview` (<0.6).
- **Embeddings** (`memory/embeddings.ts`) — BGE-M3 (1024-dim, matches `memories.embedding`) via a
  TEI-style endpoint, behind an interface.
- **Graph** (`memory/graph.service.ts`) — entity CRUD + aka-resolution, typed **link EMA upsert**
  (strength EMA + provenance union), and **recursive-CTE neighborhood** (depth ≤2, salience-ordered,
  cap 40).
- **Consolidation** (`memory/consolidation.service.ts`) — day's events → facts + relations
  (deepseek-reasoner via `parseStructured` + docs/04 §3 prompt) → embedding dedupe (≥0.88
  EMA-merge; else insert; **<0.6 conf → review**) → **contradictions → review (not active)** →
  relations → graph EMA links → salience decay. **Every memory carries provenance** (enforced by
  schema `min(1)` + code guard).
- **Retrieval** (`memory/retrieval.service.ts`) — `contextFor` = T3 core + hybrid top-k
  (vector/salience, recency-weighted) + **sensitivity filter**. `rankMemories` is pure +
  **deterministic** (0.7·score + 0.3·recency, id tiebreak). **Wired into structuring
  recommendations + briefs** (the no-op hooks from P3/P5 now call it).
- **Scheduled** — nightly consolidation cron (20:30 WIB = `30 13 * * *` UTC) added to the
  repeatable workers; wired in `worker.ts` alongside embeddings/graph/retrieval.
- **API** — `/v1/memory/search`, `/v1/entities/:id` (card + neighborhood), `/v1/memory/reviews` +
  `/resolve` (approve/edit/reject → memory active/archived), `/v1/memory/graph`. Contracts in
  `@recall/shared` (`memory.ts`).
- **Web** — **Memory** view (Review queue with `c`/`x`, Memories list with confidence + provenance
  count + sensitive flag, and a lean SVG **Graph** — node size = salience).
- **Config** — `EMBEDDINGS_API_KEY` promoted to required; `EMBEDDINGS_URL` added.

## Acceptance — demonstrated (unit)

- **EMA merge / dedupe thresholds / decay** — math 100%.
- **Consolidation:** low-confidence fact → memory **inserted as review** + `low_confidence` review
  row **with provenance**; contradiction → `contradiction` review row + referenced memory flipped
  to `review`; relation → `graph.upsertLink(...)` with provenance.
- **Retrieval determinism** — `rankMemories` stable ordering + recency + id tiebreak.
- **Gate green:** `pnpm typecheck` (3/3), `pnpm lint` (0 warnings), `pnpm test`
  (133: 119 api + 11 web + 3 shared, +8 api integration skipped), `pnpm build` (Next routes clean).

## QC gate — coverage

`memory/math.ts` at **100%** (memory-write math) — plus all prior gated files. No-memory-without-
provenance is enforced by schema + code + asserted in the consolidation test; the DB not-null
constraint check is a CI/integration follow-up.

## Deviations / notes

- **Input compaction** (personal full-fidelity vs commerce pre-summarized, ~60k cap) is
  **simplified** — events are included directly. The compaction stage is a follow-up.
- **GraphView** is a lean circular SVG (node size = salience), not d3-force — layout polish later.
- **Neighborhood CTE + vector search** run against real Postgres in CI; the fake-db unit suite
  covers the orchestration/math, not the raw SQL.
- **Retrieval into structuring** passes non-sensitive context; entity-scoped sensitive inclusion
  (for the entity page) is a follow-up.
- **T3 core-memory editor** and provenance deep-links in the entity page are lean/deferred.

## Phase-gate checklist

- [x] Acceptance path implemented; EMA/dedupe/decay/determinism/provenance unit-tested
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green
- [x] Memory-write math 100%; retrieval determinism; provenance enforced + asserted
- [x] New env keys (`EMBEDDINGS_API_KEY` required; `EMBEDDINGS_URL`)
- [x] Deviations recorded

## Handover to Phase 7 — Nightly digest

**Load:** this file, docs/00 F5, docs/04 §5, digest table, waSend, retrieval.
**Then:** digest worker (cron 21:00 WIB) — day's events + open tasks + tomorrow's calendar +
`retrieval.contextFor` → DeepSeek digest JSON (5 sections, every claim carries provenanceEventIds)
→ persist `digests` → render WA text (WIB, ≤1600 chars) → window-aware send → draft rows for
"recommend booking" items. Digests view + re-send. QC: digest claims→provenance test; both
delivery branches. Then **Phase 8** (hardening, full E2E, security matrix, deploy runbook — where
the deferred Playwright/axe/Lighthouse + live Google/Meta/Redis integration land).
