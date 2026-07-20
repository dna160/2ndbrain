# 00 — PRD: Recall (WhatsApp-Native Second Brain)

Version 1.0 · Product owner: Johnson Leonardi · Build agent: Claude Code (Opus 4.8)
Delivery target: Railway · Status: approved for build

## 1. Problem

The operator runs multiple ventures through WhatsApp, meetings, and a calendar. Capture is
manual, transcription (Plaud cloud) is expensive per-minute, meeting intelligence evaporates,
commitments live in memory, and there is no nightly consolidation of "what happened / what
must happen next." Existing tools (Otter, Fireflies, Plaud) live in the meeting-app world and
ignore the WhatsApp-native reality of Indonesian business.

## 2. Product thesis

One substrate. Everything the operator captures — WA messages, voice notes, meeting audio,
calendar events — normalizes into a single event store, gets distilled into a graph memory,
and comes back as: Plaud-grade meeting notes, a nightly action-ranked digest, and pre-meeting
briefs. Human-in-the-loop on all writes (calendar drafts, memory review). The bot never replies
in conversation; it only ingests and delivers scheduled intelligence.

## 3. Users

- **P0:** The operator (single tenant). Bilingual ID/EN, mobile-heavy, keyboard-fast on desktop.
- **P1 (design for, don't build for):** other WhatsApp-native operators/SMB founders — the
  Lynkbot merchant base is the natural expansion market. All schema and auth decisions must
  survive multi-tenancy unchanged.

## 4. Feature requirements

### F1 — WhatsApp ingestion (via Lynkbot relay)
- Same WABA as Lynkbot. Lynkbot keeps the Meta webhook; a minimal relay (spec §Lynkbot PR,
  doc 01 §3.4) forwards **all inbound messages** to Recall `/ingest/wa` with HMAC.
- **Default-capture, blacklist-to-exclude:** every sender is saved unless blacklisted.
  Blacklist managed in Recall settings; blacklisted senders' messages are dropped at ingest
  (never persisted, no event row — an ingest-drop counter is the only trace). Lynkbot knows
  nothing about the blacklist; it lives solely in Recall.
- Lynkbot keeps a separate small **personal contacts** list (operator + partners) whose
  messages get `skipAI:true` — the commerce bot never replies to them. Decoupled from relay
  scope.
- Text, voice notes, audio files, images (stored, OCR later), documents (stored).
- Idempotent by Meta message id. Never replies.

### F2 — Audio → Plaud-grade meeting notes
Accepted inputs: WA voice notes/audio (≤16MB — a 2h Plaud export in Opus/AAC ≈ 3MB, fits),
dashboard upload (presigned R2, up to 500MB for future WAV cases).
Output per meeting (the **Meeting Note** object):
1. **Topic timeline** — topic-to-topic segmentation with start–end timestamps; each topic:
   title + per-topic subnotes (bulleted, verbatim-faithful).
2. **Summary block** — meeting notes (per-topic rollup), decisions, **next action steps**
   (owner + deadline where stated), open questions.
3. **AI recommendations** — contextualized per participant using graph memory: what to push,
   what to guard, negotiation posture vs. each opposing speaker.
4. **Speaker identification** — lean mode: LLM attribution from linguistic/context cues +
   calendar attendees; names surfaced as *suggested*, confirmed with one tap; confirmed
   mappings persist to the contact entity. Attribution-confidence % logged per meeting;
   sustained <70% over trailing 10 meetings flags the pyannote upgrade decision (scaffolded
   interface, not built — doc 03 Phase 3).
- Language: verbatim transcript as spoken; summary mirrors dominant language; actions in EN.

### F3 — Google Calendar (read + draft-write)
- OAuth through Clerk (Google provider with calendar scopes). No Gmail.
- Sync events into the event store. Meetings auto-link to calendar events by time overlap.
- All calendar mutations are **drafts** (`calendar_drafts`) confirmed in the dashboard.
  Never auto-book.

### F4 — Graph memory (three tiers)
- **Working (T1):** raw events, last 48h, injected verbatim where relevant.
- **Long-term (T2):** `entities` (person/org/venture/project/topic) + typed weighted
  `entity_links` (mind-map, not hierarchy; ~10-relation controlled vocabulary) + atomic
  `memories` with embeddings (pgvector), confidence, salience, sensitivity, provenance.
- **Permanent (T3):** user-curated core memory; machine-nominated, human-promoted; always
  in prompt context.
- **Consolidation:** nightly job — extract candidate facts/relations from the day's events,
  dedupe by embedding similarity, EMA-merge confidence (Lynkbot genome pattern), decay
  salience on unaccessed memories, nominate T3 candidates.
- **Review queue:** low-confidence/contradictory extractions land in review, not in silent
  commit. Approve / edit / reject in dashboard.
- **Retrieval:** T3 always + entity neighborhoods (1–2 hop graph walk) + top-k hybrid
  (vector + keyword + recency) + T1 window. One retrieval service used by every LLM job.

### F5 — Nightly digest (21:00 WIB)
What happened · commitments made by me · commitments made to me · conflicts detected ·
ranked recommendations (book / reply / prepare). Persisted + pushed to operator's WA.
**24h-window rule:** if outside Meta's customer-service window, send pre-approved utility
template ("Your daily brief is ready") instead of free-form; log `windowState` on the digest.

### F6 — Pre-meeting briefs
60 minutes before any GCal event with known attendees: entity profiles + open commitments +
last meeting's action items + suggested posture → WA push (same window rule).

### F7 — Dashboard (`apps/web`) — productivity-tool standard
Views: **Today** (event timeline + schedule), **Conversations** (F8), **Upcoming** (7-day, conflicts, draft
confirm/adjust), **Actions** (task list w/ source links), **Meetings** (list + transcript
viewer with topic scrubber), **Digests**, **Memory** (graph view + entity pages + review
queue), **Pipeline** (live queue depth, run history, stage log, cost per run, retry), 
**Settings** (blacklist, personal contacts, connected calendar, core memory editor).
UX bar: Gmail — dense, every pixel purposeful, zero decoration, keyboard-first (j/k, g+key
navigation, ⌘K command palette). Full spec: doc 02.

### F8 — Conversations (read + reply, full inbox)
- Dashboard tab listing **all** chat threads on the WABA (minus blacklisted): personal
  contacts and commerce buyers alike.
- Thread view: full two-way history — inbound relayed events, operator replies, and
  **Lynkbot bot replies** (relayed as outbound events so threads read complete), media
  rendering (audio player w/ transcript link when available), unread state.
- Threads currently handled by Lynkbot's commerce bot carry a "Bot active" chip.
- Reply composer: sends via shared WABA (Meta send API). 24h-window rule applies — outside
  the window the composer switches to approved-template mode with an explanatory notice.
- **Takeover protocol:** replying from Recall to a bot-active thread first confirms
  ("Replying pauses the assistant for this chat for 24h"), then calls Lynkbot's takeover
  endpoint (pause bot for that waId, 24h, resumable from the thread header). Replies to
  personal contacts (already `skipAI`) send without ceremony.
- Outbound replies are persisted as `events` (direction=outbound) — both directions feed
  memory consolidation.
- Blacklisting a thread from its header stops future capture and (optional prompt) purges
  its stored history.

### F9 — Pipeline observability & cost metering
`pipeline_runs`: one row per job; stage transitions with latency; error payloads; retry from
dashboard; STT seconds + LLM tokens in/out + computed IDR cost per run. This is the unit-
economics ledger for future pricing.

## 5. Non-functional requirements

- **Cost ceiling:** infra ≤ $25/mo single-user (Railway + R2); marginal cost per 2h meeting
  ≤ Rp7.500 in lean mode.
- **Latency targets (async pipeline):** voice note ≤2 min to note; 2h upload ≤15 min lean.
- **Reliability:** no silent drops — every ingested event either reaches `persisted` stage or
  appears in DLQ with alert row; raw payload + media in R2 make every stage replayable.
- **Security:** Clerk auth on web + API; HMAC on relay; internal API key on internal routes;
  R2 presigned URLs short-lived; sensitivity-flagged memories excluded from shareable outputs.
- **Privacy:** no third-party analytics in v1; data stays in Railway/R2.

## 6. Success metrics (30 days post-launch)

- ≥90% of captured audio produces a completed Meeting Note without manual retry.
- Speaker attribution confidence ≥70% trailing average (else pyannote decision triggers).
- Digest delivered ≥28/30 nights (window fallback counted as delivered).
- Operator confirms ≥50% of memory-review items weekly (trust proxy).
- Cost per meeting-hour tracked and visible in Pipeline view.

## 7. Explicit out of scope (v1)

Gmail; voiceprint diarization enrollment; auto-booking; native mobile; multi-user workspace
UI; billing/metering enforcement; Lynkbot genome integration (v2 candidate: contact
intelligence); image OCR (store only).

## 8. Open tensions (product owner decisions)

1. **Embeddings provider.** DeepSeek has no embeddings endpoint. Recommendation: OpenAI
   `text-embedding-3-small` (multilingual, ~$0.02/1M tokens). Alternative: Voyage or
   self-hosted BGE-M3 (adds a service). Default in build: OpenAI unless overridden.
2. **Working name.** "Recall" is a codename; rename is a find-replace + env change.
3. **[RESOLVED → in scope]** Full-inbox conversations shipped in v1 with the lightweight
   takeover protocol (reply pauses bot 24h). Residual v2 question: richer handback UX
   (bot resume summaries, partial takeover per intent).
