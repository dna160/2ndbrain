# Recall — Deploy & Operations Runbook

Production target: **Railway** (3 services from one repo) + Postgres (pgvector) + Redis add-ons +
Cloudflare R2. See `infra/railway.json` and `infra/Dockerfile.{api,web}`.

## Services

| Service | Image | Start | Notes |
|---|---|---|---|
| `api` | `Dockerfile.api` | `pnpm --filter @recall/api start` (MODE=http) | healthcheck `/internal/health` |
| `worker` | `Dockerfile.api` | `pnpm --filter @recall/api start:worker` (MODE=worker) | BullMQ consumers + repeatable crons |
| `web` | `Dockerfile.web` | `pnpm --filter @recall/web start` | Next 14 |

## First deploy

1. Provision Postgres (**enable `pgvector`** — migration 0000 also does `CREATE EXTENSION`) + Redis.
2. Set all env vars (registry: `docs/01-ARCHITECTURE.md §8` / `.env.example`). Required by phase are
   enforced fail-fast by `apps/api/src/config.ts` at boot.
3. Configure Clerk: Google OAuth provider + Calendar scopes; copy keys.
4. Register the Meta **utility template** `daily_brief_ready` (WA_UTILITY_TEMPLATE) in Business Manager.
5. Apply the **Lynkbot PRs** (`docs/lynkbot-pr/phase-2-relay.md`, `phase-5-takeover.md`) so inbound
   messages relay to `CORTEX_INGEST_URL=/ingest/wa` with the timestamp-bound HMAC.
6. Deploy `api` first, run migrations: `pnpm --filter @recall/api db:migrate` (idempotent —
   `schema_migrations` tracking). Then `pnpm db:seed` (tenant + operator + own waId 'Operator').
7. Deploy `worker` and `web`. Verify `/internal/health` → 200.

## Migration policy

- **Additive-only until v1.1.** No destructive column drops/renames on a live DB; add new columns
  nullable, backfill, then tighten in a later release.
- The runner is idempotent and transaction-per-file; safe to run on every deploy.

## Rollback

1. Redeploy the **previous image** for the affected service (Railway keeps prior deploys).
2. Because migrations are additive-only, the previous image runs against the newer schema — no DB
   rollback needed. If a migration must be reverted, write a new additive forward migration.
3. Confirm `/internal/health` and the Pipeline view (queue depths, no growing `failed`).

## Monitoring & alerts

- **Pipeline view** (`/pipeline`) — live queue depths + run history + cost. First place to look.
- **DLQ** — `GET /internal/dlq` (internal key) lists poisoned jobs. **Automated:** the briefs cron
  runs `AlertsService.checkDlq` every 10 min → **DLQ depth > 0 sends a WhatsApp alert** to the
  operator. Replay a failed run from the Pipeline view (idempotent).
- **Reliability invariant:** every ingested event reaches `persisted` or lands in the DLQ with an
  alert; raw payload + media in R2 make every stage replayable.

## Incident playbook

- **Transcription/structuring failing:** check `/internal/dlq` + the run's StageTimeline; verify
  `GROQ_API_KEY` / `DEEPSEEK_API_KEY`; retry the run.
- **Nothing ingesting:** verify the Lynkbot relay is firing + `LYNKBOT_RELAY_SECRET` matches; a
  stale-timestamp 401 means clock skew > 5 min (`RELAY_MAX_SKEW_MS`).
- **Digest/brief not delivered:** check `deliveredVia` (template = out of 24h window) + Meta token.
- **Blacklist purge:** the only hard-delete path; `POST /v1/conversations/:waId/block {purgeHistory}`.
