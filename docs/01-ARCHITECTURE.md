# 01 — Architecture & System Design

## 1. System diagram

```mermaid
flowchart LR
  subgraph Meta
    WA[WhatsApp Cloud API]
  end
  subgraph Lynkbot [Lynkbot (existing, small PR)]
    LWH[/webhooks/meta/] --> RELAY[brain relay<br/>all inbound + HMAC]
  end
  subgraph Recall API [apps/api — Fastify]
    ING[/ingest/wa/]
    UPL[/v1/uploads/]
    CAL[calendar sync svc]
    API[/v1/* dashboard API/]
  end
  subgraph Workers [apps/api workers — BullMQ]
    QM[media] --> QT[transcription] --> QS[structuring]
    QC[consolidation]; QD[digest]; QB[briefs]; QCAL[calendar-sync]
  end
  PG[(Postgres + pgvector)]
  RD[(Redis)]
  R2[(Cloudflare R2)]
  WEB[apps/web — Next.js + Clerk]
  GCal[Google Calendar]
  STT[Groq Whisper v3]
  LLM[DeepSeek Reasoner]
  EMB[Embeddings API]

  WA --> LWH; RELAY -->|HMAC POST| ING
  ING --> QM; UPL --> QM; QM --> R2
  QT --> STT; QS --> LLM; QC --> LLM & EMB; QD --> LLM; QB --> LLM
  Workers <--> PG; Workers <--> RD; API <--> PG
  CAL <--> GCal; QCAL --> PG
  QD -->|send| WA; QB -->|send| WA
  WEB <--> API
```

Two Railway services from one repo: `api` (HTTP) and `worker` (queue consumers + repeatable
jobs), plus Postgres and Redis add-ons. `apps/web` deploys to Railway as a third service (or
Vercel — deploy config supports both; Railway is default).

## 2. Monorepo filetree (authoritative — create exactly this)

```
recall/
├── CLAUDE.md
├── docs/                        # this documentation set + progress/
├── package.json                 # pnpm workspaces
├── pnpm-workspace.yaml
├── turbo.json
├── .github/workflows/ci.yml
├── fixtures/                    # golden test fixtures (payloads, audio, expected outputs)
├── packages/
│   └── shared/
│       └── src/
│           ├── schemas/         # zod: events, meetings, memories, digests, pipeline, api/*
│           ├── types.ts         # inferred exports only
│           └── constants.ts     # QUEUES, RELATION_TYPES, STAGES, ENTITY_KINDS
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts             # Fastify bootstrap (http mode)
│   │   │   ├── worker.ts            # worker bootstrap (queue mode) — same image, env switch
│   │   │   ├── config.ts            # env parsing (zod), fail-fast
│   │   │   ├── db/
│   │   │   │   ├── schema/          # drizzle schema, one file per domain
│   │   │   │   │   ├── tenancy.ts   # tenants, users, waSenders, connectedAccounts
│   │   │   │   │   ├── events.ts    # events, mediaAssets
│   │   │   │   │   ├── meetings.ts  # transcripts, meetings, tasks
│   │   │   │   │   ├── memory.ts    # entities, entityLinks, memories, memoryReviews
│   │   │   │   │   ├── calendar.ts  # calendarEvents, calendarDrafts
│   │   │   │   │   └── ops.ts       # pipelineRuns, digests, dlq
│   │   │   │   ├── client.ts
│   │   │   │   └── migrate.ts       # [DEDUPE: lynkbot apps/api/src/migrate.ts]
│   │   │   ├── plugins/
│   │   │   │   ├── auth.ts          # Clerk JWT verification (replaces lynkbot stub)
│   │   │   │   ├── cors.ts          # [DEDUPE: lynkbot plugins/cors.ts]
│   │   │   │   └── metrics.ts       # [DEDUPE: lynkbot plugins/metrics.ts]
│   │   │   ├── middleware/
│   │   │   │   ├── relayHmac.ts     # verify LYNKBOT_RELAY_SECRET signature
│   │   │   │   └── internalApiKey.ts# [DEDUPE: lynkbot middleware/internalApiKey.ts]
│   │   │   ├── routes/
│   │   │   │   ├── ingest/wa.ts     # POST /ingest/wa (relay receiver, idempotent)
│   │   │   │   ├── v1/{events,meetings,tasks,memory,entities,digests,calendar,
│   │   │   │   │      pipeline,settings,uploads}.ts
│   │   │   │   └── internal/{cron,dlq,health}.ts   # [DEDUPE: cron seed + dlq patterns]
│   │   │   ├── services/
│   │   │   │   ├── llm/
│   │   │   │   │   ├── client.ts    # getLLMClient() [DEDUPE: lynkbot getLLMClient pattern]
│   │   │   │   │   ├── deepseek.ts  # reasoner, JSON schema-validate + repair
│   │   │   │   │   └── router.ts    # jobType → model routing table
│   │   │   │   ├── stt/
│   │   │   │   │   ├── provider.ts  # SttProvider interface (transcribe → segments/words)
│   │   │   │   │   ├── groqWhisper.ts
│   │   │   │   │   └── diarization.provider.ts  # interface ONLY + noop impl (pyannote later)
│   │   │   │   ├── embeddings.ts
│   │   │   │   ├── media.service.ts       # Meta media fetch, R2 put/get, presign
│   │   │   │   ├── ingest.service.ts      # normalize → events
│   │   │   │   ├── transcription.service.ts
│   │   │   │   ├── structuring.service.ts # topics/summary/actions/recommendations
│   │   │   │   ├── speaker.service.ts     # lean attribution + confirm-mapping persistence
│   │   │   │   ├── memory/
│   │   │   │   │   ├── consolidation.service.ts  # extract→dedupe→EMA merge→review flags
│   │   │   │   │   ├── retrieval.service.ts      # T3 + graph walk + hybrid top-k + T1
│   │   │   │   │   └── graph.service.ts          # entity/link CRUD, recursive CTE walks
│   │   │   │   ├── digest.service.ts
│   │   │   │   ├── brief.service.ts
│   │   │   │   ├── calendar.service.ts    # GCal sync + drafts
│   │   │   │   ├── waSend.service.ts      # Meta send + 24h-window check + template fallback
│   │   │   │   └── pipeline.service.ts    # stage logging + cost metering helpers
│   │   │   └── queues/
│   │   │       ├── index.ts         # QUEUES const, connections [DEDUPE: lynkbot pattern]
│   │   │       └── workers/{media,transcription,structuring,consolidation,
│   │   │                    digest,briefs,calendarSync}.worker.ts
│   │   └── test/                    # mirrors src; integration/ + contract/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── (app)/{today,conversations,conversations/[waId],upcoming,actions,
│       │   │   │         meetings,meetings/[id],digests,memory,memory/[entityId],
│       │   │   │         pipeline,settings}/page.tsx
│       │   │   ├── layout.tsx       # shell: nav rail + panes
│       │   │   └── sign-in/…        # Clerk
│       │   ├── components/
│       │   │   ├── shell/{NavRail,ListPane,DetailPane,CommandPalette,Toasts}.tsx
│       │   │   ├── conversations/{ThreadRow,MessageBubble,ReplyComposer,
│       │   │   │                  TemplateFallbackNotice}.tsx
│       │   │   ├── meetings/{TranscriptViewer,TopicScrubber,SpeakerChip,
│       │   │   │            RecommendationCard}.tsx
│       │   │   ├── memory/{GraphView,EntityCard,MemoryRow,ReviewQueue}.tsx
│       │   │   ├── pipeline/{RunRow,StageTimeline,CostBadge}.tsx
│       │   │   └── ui/              # primitives per design system (doc 02)
│       │   ├── lib/{api.ts,queries/,keyboard.ts,time.ts}
│       │   └── styles/tokens.css
│       └── test/                    # vitest + playwright specs
└── infra/
    ├── railway.json                 # 3 services: api, worker, web
    └── Dockerfile.api / Dockerfile.web
```

## 3. Lynkbot dedupe manifest (explicit, as required)

Recall is a **new repo** that dedupes proven Lynkbot patterns. Do not clone the repo; pull the
named files from `github.com/dna160/lynkbot` and adapt. Three categories:

### 3.1 COPY-ADAPT (bring the file, modify as noted)
| Lynkbot file | Into Recall | Adaptation |
|---|---|---|
| `apps/api/src/migrate.ts` | `apps/api/src/db/migrate.ts` | paths only |
| `apps/api/src/plugins/cors.ts` | same | origins from env |
| `apps/api/src/plugins/metrics.ts` | same | add queue-depth + pipeline-stage counters |
| `apps/api/src/middleware/internalApiKey.ts` | same | none |
| `apps/api/src/routes/internal/cron.ts` | `routes/internal/cron.ts` | seed Recall repeatables: `consolidation.nightly` (20:30 WIB), `digest.nightly` (21:00 WIB), `briefs.scan` (every 10 min), `calendar.sync` (every 15 min) — same remove-then-add repeatable pattern |
| `apps/api/src/routes/internal/dlq.ts` | same | queue names swapped |
| queue setup (`QUEUES` const + connection helper) | `queues/index.ts` | Recall queue names |
| `services/llm` `getLLMClient()` abstraction incl. dual-model fallback + `modelId:'error'` convention | `services/llm/client.ts` | providers: DeepSeek primary for reasoning jobs; keep fallback slot configurable |
| JSON fence-rescue + shape-normalization from `routes/v1/ai.ts` (generate-flow parser) | `services/llm/deepseek.ts` | generalize into `parseStructured<T>(zodSchema)` with one repair retry |

### 3.2 PATTERN-REFERENCE (re-implement the idea, not the code)
| Lynkbot source | Recall use |
|---|---|
| `routes/webhooks/meta.ts` — idempotent ingest: insert log `onConflictDoNothing` → duplicate = 200 early-return → enqueue with backoff | `/ingest/wa` uses identical shape against `events` (unique `metaMessageId`) + `pipeline_runs` |
| `services/scheduling.service.ts` — `handleLLMEnvelope` action-envelope parsing, reminder enqueue | `calendar.service.ts` drafts + `brief.service.ts` scheduling |
| genome EMA merge + confidence tiers + `genomeMutations` audit trail (`routes/v1/intelligence.ts`, genome services) | `memory/consolidation.service.ts` confidence merging + memory audit rows |
| broadcast 24h/template mechanics + `sleep(750)` pacing (`routes/v1/broadcasts.ts`) | `waSend.service.ts` window check + template fallback + pacing |

### 3.3 REQUIRED LYNKBOT-SIDE PR (the only change to Lynkbot)
In `apps/api/src/routes/webhooks/meta.ts`, immediately after the idempotency insert succeeds:
fire-and-forget enqueue `relay.forward` → POST full raw webhook body (messages AND status
callbacks) to `RECALL_INGEST_URL/ingest/wa` with header
`x-relay-signature: HMAC-SHA256(body, LYNKBOT_RELAY_SECRET)`, 3 attempts exponential
backoff. **No filtering in Lynkbot** — the blacklist lives in Recall only. Additionally:
(a) relay the bot's own outbound sends (post-send hook → same relay job, marked
`origin:'lynkbot_bot'`) so Recall threads read complete; (b) keep a small **personal
contacts** list (env CSV or table: operator + partners) → `skipAI:true` on `handleInbound`;
(c) new endpoint `POST /internal/brain/takeover {waId, untilISO}` (internal API key) →
suppresses bot replies for that waId until expiry (in-memory + table row), and
`DELETE` to resume. Estimated size: ~150 LOC + 1 migration. Ship in Phase 2 (relay +
personal contacts) and Phase 5 (takeover + bot-outbound relay).

## 4. Database schema (Drizzle — summary; implement in `db/schema/*`)

All tables: `id uuid pk default gen_random_uuid()`, `tenantId uuid not null` (+ index),
`createdAt/updatedAt timestamptz`. Enable `pgvector` extension in migration 0001.

- **tenants**(name) · **users**(clerkUserId unique, tenantId, role)
- **waContacts**(waId unique, label?, blocked bool default false, botActiveUntil?
  timestamptz, lastInboundAt?, purgedAt?) — the contact registry; `blocked=true` = blacklist
  (ingest drops, nothing persisted); auto-upserted on first inbound from any sender
- **connectedAccounts**(provider='google', clerkUserId, scopes[], externalId) — tokens live in
  Clerk; store metadata + sync cursor only
- **events**(source enum[wa,gcal,upload,system] · type enum[message,audio,image,document,
  calendar,note] · direction enum[inbound,outbound,system] default inbound · externalId
  unique-nullable (metaMessageId/gcalId) · senderWaId? · occurredAt · content text? ·
  raw jsonb · mediaAssetId? · readAt?) — **the substrate**; conversations are derived by
  grouping wa message events on senderWaId (no separate conversations table in v1)
- **mediaAssets**(r2Key, mime, bytes, durationSec?, sha256)
- **transcripts**(eventId fk · status enum[pending,processing,done,failed] · language ·
  languageConfidence real · sttProvider · diarizationMode enum[none,llm,pyannote] ·
  segments jsonb `[{startMs,endMs,speakerKey,text}]`)
- **meetings**(transcriptId fk · calendarEventId? · title · occurredAt · durationSec ·
  participants jsonb `[{speakerKey,entityId?,suggestedName?,confirmed,confidence}]` ·
  topics jsonb `[{title,startMs,endMs,subnotes[]}]` · summary text · decisions jsonb ·
  openQuestions jsonb · recommendations jsonb `[{entityId?,speakerKey,advice}]` ·
  attributionConfidence real)
- **tasks**(title · status enum[open,done,dropped] · ownerEntityId? · dueAt? ·
  sourceEventId · meetingId? · normalizedLang default 'en')
- **entities**(kind enum[person,org,venture,project,topic] · name · aka jsonb ·
  profile jsonb · salience real default 0.5 · sensitivity enum[normal,sensitive] ·
  isCore bool default false)  — T3 = `isCore=true` entities' pinned facts + coreNotes table? →
  **coreMemories**(content, position) small separate table, always injected
- **entityLinks**(fromId · toId · relation enum[works_at,founder_of,partner_in,invested_in,
  advises,client_of,supplier_of,member_of,blocks,related_to] · strength real ·
  provenanceEventIds jsonb) — unique(fromId,toId,relation)
- **memories**(content · entityIds jsonb · embedding vector(1536) · confidence real ·
  salience real · sensitivity · status enum[active,review,archived] ·
  provenanceEventIds jsonb · lastAccessedAt) + ivfflat index on embedding
- **memoryReviews**(memoryId · reason enum[low_confidence,contradiction,t3_nomination] ·
  resolution enum[approved,edited,rejected]? · resolvedAt?)
- **calendarEvents**(gcalId unique · accountId · title · startAt · endAt · attendees jsonb ·
  raw jsonb · briefSentAt?)
- **calendarDrafts**(action enum[create,update,cancel] · payload jsonb ·
  status enum[proposed,confirmed,rejected] · sourceType enum[digest,meeting,manual] ·
  sourceId? · appliedAt?)
- **digests**(date date unique-per-tenant · content jsonb · deliveredVia enum[freeform,
  template,none] · windowState jsonb)
- **pipelineRuns**(jobType · refType/refId · status enum[running,done,failed,dead] ·
  stages jsonb `[{stage,at,ms,ok,err?}]` · sttSeconds real · tokensIn int · tokensOut int ·
  costIdr int · attempts int · error jsonb?) — stages vocabulary in `shared/constants.ts`:
  `ingested→media_stored→transcribed→structured→persisted→notified` (subset per jobType)

## 5. Queues (BullMQ)

`media` (fetch/store) → `transcription` (Groq) → `structuring` (DeepSeek) ·
`consolidation` (nightly 20:30) · `digest` (nightly 21:00) · `briefs` (10-min scan) ·
`calendarSync` (15-min). Defaults: attempts 3, exponential 5s, removeOnComplete 100,
removeOnFail false → DLQ visibility. Every worker wraps stages with
`pipeline.service.stage(runId, name, fn)`.

## 6. LLM routing table (`services/llm/router.ts`)

| jobType | model | notes |
|---|---|---|
| structuring, consolidation, digest, brief, recommendation | `deepseek-reasoner` | JSON via `parseStructured` + zod, 1 repair retry |
| speaker attribution, entity/relation extraction | `deepseek-chat` | cheaper, structured |
| fallback slot | configurable env | keep Lynkbot dual-model convention |
| embeddings | `text-embedding-3-small` (default, see PRD open tension) | 1536-dim |

## 7. API surface (contract-first; zod in `packages/shared/src/schemas/api/`)

`POST /ingest/wa` (relayHmac) · `POST /v1/uploads/presign` + `POST /v1/uploads/complete` ·
`GET /v1/events` · `GET /v1/conversations` (threads: waId, label, lastMessage, unreadCount)
· `GET /v1/conversations/:waId/messages` · `POST /v1/conversations/:waId/messages`
(window-aware send via waSend; outbound persisted as events) ·
`POST /v1/conversations/:waId/read` · `POST /v1/conversations/:waId/takeover` +
`DELETE .../takeover` (proxies Lynkbot internal endpoint) ·
`POST /v1/conversations/:waId/block {purgeHistory?}` · `GET/PATCH /v1/meetings/:id` (+ `POST /:id/participants/:speakerKey/confirm`)
· `GET/PATCH /v1/tasks` · `GET /v1/digests` · `GET /v1/calendar/upcoming` ·
`POST /v1/calendar/drafts/:id/confirm|reject` · `GET /v1/memory/search` ·
`GET /v1/entities/:id` (+neighborhood) · `GET/POST /v1/memory/reviews/:id/resolve` ·
`GET /v1/pipeline/runs` + `POST /v1/pipeline/runs/:id/retry` · `GET/PUT /v1/settings/*` ·
`GET /internal/health` · internal cron/dlq routes (internalApiKey).
Auth: Clerk JWT on `/v1/*` (Fastify plugin verifies via Clerk backend SDK; maps
clerkUserId→tenantId, caches 5 min).

## 8. Environment registry

| Key | Service | Notes |
|---|---|---|
| DATABASE_URL, REDIS_URL | api, worker | Railway add-ons |
| CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY | api / web | Google OAuth + calendar scopes configured in Clerk dashboard |
| R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET | api, worker | |
| GROQ_API_KEY, DEEPSEEK_API_KEY, EMBEDDINGS_API_KEY | worker | |
| LYNKBOT_RELAY_SECRET | api + lynkbot | HMAC shared secret |
| META_ACCESS_TOKEN, META_PHONE_NUMBER_ID | worker | outbound digest/brief sends |
| INTERNAL_API_KEY, APP_URL, TZ_DISPLAY=Asia/Jakarta | all | |

## 9. ADRs (recorded decisions)

1. New repo deduping Lynkbot patterns, not an in-repo extension — clean auth story (Clerk),
   independent deploy cadence, Lynkbot untouched except the relay PR.
2. Same WABA; Lynkbot owns the Meta webhook; HMAC relay to Recall (Meta allows one webhook
   URL per app — relay is the only correct topology).
3. Lean STT: Groq Whisper + LLM speaker attribution; `DiarizationProvider` interface
   scaffolded with noop impl; pyannote is a config-pluggable upgrade gated on the <70%
   attribution metric. No GPU infra in v1.
4. Postgres + pgvector as the only datastore (no Neo4j, no vector DB) — graph via
   `entityLinks` + recursive CTEs; two-service infra holds.
5. DeepSeek Reasoner for heavy reasoning via the deduped `getLLMClient` abstraction;
   routing table makes model swaps config-level.
6. Human-in-the-loop on all writes: calendar drafts + memory review. Never auto-book,
   never silent-commit low-confidence memories.
