# Deploying Recall on Railway

Recall is a **pnpm-workspace monorepo → 3 Railway services** (api, worker, web), all built from
this one repo, plus **pgvector Postgres** + **Redis** + external **Cloudflare R2**.

Railway launches a service one of three ways: **Dockerfile**, **Nixpacks** (auto-detect), or
**config-as-code** (`railway.json`/`railway.toml`). This repo ships **custom Dockerfiles** under
`infra/` and a **per-service config file** for each — that is the supported, deterministic path
(Nixpacks does not handle this workspace well). Each service points at its own config file.

---

## 0. Postgres MUST have pgvector

Migration `0000` runs `CREATE EXTENSION vector` (the `memories.embedding vector(1024)` column +
ivfflat index). **Railway's default PostgreSQL plugin does NOT include pgvector** — the deploy will
fail on migrate. Use one of:

- Railway's **"Postgres + pgvector"** template (search Templates), **or**
- Deploy a service from the Docker image **`pgvector/pgvector:pg16`** with a **Volume** mounted at
  `/var/lib/postgresql/data` and `POSTGRES_PASSWORD` set; use its connection string as `DATABASE_URL`.

Add **Redis** from the Railway plugin/template (BullMQ needs it).

---

## 1. Create the three services (same repo)

In your Railway project, add **three services**, each "Deploy from GitHub repo" → `dna160/2ndbrain`.
For each, set **Settings → Config-as-code / Railway Config File** to the matching file:

| Service | Config file | Public domain? | Notes |
|---|---|---|---|
| `recall-api` | `infra/railway.api.json` | yes (generate domain) | healthcheck `/internal/health` |
| `recall-worker` | `infra/railway.worker.json` | no | BullMQ consumers + crons |
| `recall-web` | `infra/railway.web.json` | yes (generate domain) | Next.js |

Leave **Root Directory empty** (the Dockerfiles COPY from the repo root; that is the build context).

> **Fallback if config-as-code isn't available on your plan:** per service set the variable
> `RAILWAY_DOCKERFILE_PATH` (`infra/Dockerfile.api` for api+worker, `infra/Dockerfile.web` for web)
> and set the **Custom Start Command** in Settings to the `startCommand` shown in each config file.

The api and worker share `Dockerfile.api`; the worker's start command (`start:worker`) sets
`MODE=worker` inline, so no extra env is needed to switch modes.

---

## 2. Environment variables (set on api + worker; web needs the two Clerk keys)

`apps/api/src/config.ts` **fail-fasts** if any required var is missing — the service won't boot.
Set these on **both** `recall-api` and `recall-worker` (use Railway **reference variables** for the
datastores):

```
NODE_ENV=production
APP_URL=https://<your recall-web domain>
INTERNAL_API_KEY=<random ≥16 chars>
TZ_DISPLAY=Asia/Jakarta

DATABASE_URL=${{Postgres.DATABASE_URL}}     # your pgvector Postgres
REDIS_URL=${{Redis.REDIS_URL}}

CLERK_SECRET_KEY=sk_live_...

R2_ACCOUNT_ID=...  R2_ACCESS_KEY_ID=...  R2_SECRET_ACCESS_KEY=...  R2_BUCKET=recall-media

GROQ_API_KEY=...          # Whisper STT
DEEPSEEK_API_KEY=...      # structuring / consolidation / digest / brief
EMBEDDINGS_API_KEY=...    # BGE-M3
EMBEDDINGS_URL=https://<your BGE-M3 / TEI endpoint>/embed

LYNKBOT_RELAY_SECRET=<shared with Lynkbot, ≥16 chars>
LYNKBOT_INTERNAL_URL=https://<lynkbot api base>
META_ACCESS_TOKEN=...     # WhatsApp Cloud API
META_PHONE_NUMBER_ID=...
WA_UTILITY_TEMPLATE=daily_brief_ready
```

On **recall-web** set:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...   # inlined at build (passed as a Docker ARG)
CLERK_SECRET_KEY=sk_live_...                    # server-side auth() at runtime
```

> Don't have a provider wired yet (e.g. the BGE-M3 endpoint)? You still need the var **present** to
> boot — set a placeholder; the feature errors only when actually invoked, the app still starts.

---

## 3. First deploy order

1. Deploy **Postgres (pgvector)** + **Redis**.
2. Deploy **recall-api**. Once healthy, run migrations + seed from the api service shell:
   `pnpm --filter @recall/api db:migrate` then `pnpm --filter @recall/api db:seed`
   (override seed with `SEED_CLERK_USER_ID` / `SEED_OPERATOR_WAID`). Migrations are idempotent.
3. Deploy **recall-worker** and **recall-web**. Generate domains for api + web; set `APP_URL` to the
   web domain.
4. Verify `GET https://<api>/internal/health` → `200 {"status":"ok","db":true,"redis":true}`.

Then apply the two **Lynkbot PRs** (`docs/lynkbot-pr/`) so inbound WhatsApp relays to
`https://<api>/ingest/wa`. Ports are automatic — the api binds `$PORT`, Next binds `$PORT`.

See `docs/RUNBOOK.md` for rollback, migration policy, and the incident playbook.
