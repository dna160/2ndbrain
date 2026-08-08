# Plaud-as-System-of-Record — Migration Plan

**Status:** Approved-for-planning · awaiting go-ahead on Phase 3a
**Supersedes:** the STT / diarization / meeting-note-generation portions of `docs/00-PRD.md` and the original Phase 3.
**Source:** `docs/05-PRD-PLAUD-SYNC.md` (pasted), reconciled against the real repo.

---

## 0. Premise correction (the PRD was wrong about repo state)

The PRD assumed "Phase 0, nothing built, deletion = editing 5 markdown files." **False** — it inferred
from a stale README it couldn't read past. Verified reality:

- All 8 phases done (`PHASE-0-DONE.md` … `PHASE-8-DONE.md`); **deployed and live on Railway**, actively transcribing.
- The Whisper/STT/diarization/note-gen code **exists and runs**. This is a **refactor of a deployed subsystem**, not spec surgery.

**Consequence:** deletion is the LAST phase, behind a feature flag, after Plaud is proven live. The PRD's
"strip STT keys from config first" is backwards — the live worker imports `groqWhisper`, so that order
breaks `tsc` and crash-loops `recall-worker`.

## Locked decisions

- **§12.1 = Option C** — drop WhatsApp voice-note transcription entirely. All STT deleted (`groqWhisper.ts`, `STT_LANGUAGE`, `STT_PROMPT`, `GROQ_API_KEY`, `DIARIZATION`). WA voice notes: audio stored, no transcript, no memory extraction.
- **§12.2 = No audio mirror** — `PLAUD_MIRROR_AUDIO=false`. Mirror only transcript JSON + notes markdown to R2.
- **§12.3 = Adaptive polling** — 2h base + 15-min bursts for 120min after each calendar event ends + forced sync 20min before each event + WA `sync now` (rate-limited 1/min).

## Findings the plan agent surfaced (not in the PRD)

1. **`routes/v1/uploads.ts` is a second producer** into `recall-transcription` — the PRD only knew about the WA path. Must be unwired too (→ store-only).
2. **`consolidation.service.ts` reads `events.content`, not `meetings`** — so memory wiring (3d) is about writing substantive `events.content` on Plaud import, not re-plumbing consolidation.
3. **`ALTER TYPE … ADD VALUE` can't run in the migration runner's per-file transaction** (Postgres restriction). The two enum additions (`event_source += 'plaud'`, `diarization_mode += 'plaud'`) go in their own migration file.
4. **The audio→transcription branch removal leaves a dangling `pipeline_runs` row** — WA audio events must complete at `media_stored` instead of relying on the (deleted) transcription stage to close them.
5. **The `recall-transcription`/`recall-structuring` queues must be drained** (producers stopped, depth confirmed 0) before deleting the workers, or orphaned Redis jobs sit forever.

---

## Phase spine

| Phase | Ships | Touches live code? |
|---|---|---|
| **3a** Plaud adapter | `PlaudClient` (HTTP), refresh-token auth, zod schemas in `packages/shared`, recorded-fixture tests. Behind `PLAUD_SYNC_ENABLED=false`. | No — purely additive |
| **3b** Sync loop | `recall-plaud-sync` queue + worker, `plaud_recordings`/`plaud_sync_state` tables, readiness state machine, R2 mirror (JSON+md), cost metering, adaptive polling. Dark. | No — dark behind flag |
| **3c** Speaker resolution + `sync now` | Plaud speakers → `meetings.participants` (reuses existing confirm flow), operator WA command. | No — dark |
| **3d** Wire memory extraction | Plaud import writes substantive `events.content`+provenance so nightly consolidation picks it up. | No — dark |
| **3e** Delete Whisper/pyannote/note-gen + docs + env | Remove STT path, unwire media+uploads, strip config keys, update all docs. **Only after 3a–3d proven live.** | **Yes — coordinated with Railway** |

Each phase: green gates (`typecheck`/`lint`/`test`/`build`), 100% coverage on idempotency/auth/cost/memory-write + the new readiness state machine, worker success/retry/DLQ tests, and a `PHASE-3X-PLAUD-DONE.md` handoff.

## Open decision (needs your call — see chat)

**The recommendation pass.** Plaud produces topic/summary/action notes (we delete our generation of those).
But the **per-participant, graph-memory-contextualized recommendations** (PRD F2.3, a Recall differentiator)
are *not* something Plaud makes. Keep a lean DeepSeek pass over the Plaud transcript + `retrieval.contextFor`,
or drop F2.3 and run zero LLM on the meeting path?

## Railway gotchas folded into every deploy step

Dashboard-set fields override `railway.json`; `preDeployCommand` doesn't shell-interpret `&&`; redeploy replays
the old snapshot; applying vars doesn't deploy; api migrates before worker boots. New `PLAUD_*` keys must be set
on Railway **before** the deploy that requires them, or fail-fast config crash-loops the service.
