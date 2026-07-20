# PHASE 0 — Scaffold & CI · DONE

**Date:** 2026-07-20 · **Agent:** Claude Code (Opus 4.8)
**Goal (docs/03):** runnable monorepo, deploy skeleton, CI green on empty project.

## What shipped

- **pnpm workspace + Turborepo** (`pnpm-workspace.yaml`, `turbo.json`, root `package.json`)
  with the CLAUDE.md command surface: `dev / typecheck / lint / test / build` (+ `test:e2e`,
  `format`). Node ≥ 20.11, pnpm 9.15 pinned via `packageManager`.
- **`packages/shared`** — the contract source of truth. `constants.ts` (QUEUES, STAGES,
  ENTITY_KINDS, RELATION_TYPES, JOB_TYPES, PROMPT_VERSION, RATES_IDR, WA/digest/brief limits),
  `types.ts` (inferred literal-union types only), `schemas/` (zod barrel — vocabulary enums;
  domain schemas added per phase). Consumed as TS source (no dist emit) via tsx / Next
  `transpilePackages`.
- **`apps/api`** — Fastify 5 HTTP bootstrap (`index.ts`, `GET /internal/health`), worker
  bootstrap stub (`worker.ts`, MODE=worker, graceful shutdown), and **`config.ts`**: zod env
  parsing, **fail-fast with every offending key named** (`ConfigError`). Registry keys are
  `optional()` until their phase promotes them (documented inline), so dev boots before
  datastores/providers exist.
- **`apps/web`** — Next 14 App Router, Clerk wired (`ClerkProvider` in root layout,
  `clerkMiddleware` in `src/middleware.ts`), stubbed `/` and `/sign-in` pages, baseline
  `globals.css`. Real design-system tokens deferred to Phase 4 per docs/02.
- **`infra/`** — `railway.json` (3 services: api / worker / web; worker = api image with
  MODE=worker), `Dockerfile.api` (shared api+worker image), `Dockerfile.web`.
- **`.github/workflows/ci.yml`** — install → typecheck → lint → test → build, pnpm cache,
  frozen lockfile, dummy well-formed Clerk keys for the web prerender.
- **`fixtures/README.md`** — required-fixtures table (populated in Phases 2/3).
- **Tooling**: root `.eslintrc.cjs` (single repo-wide config), `.prettierrc.json`,
  `tsconfig.base.json` (strict: `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`,
  `no-explicit-any` via eslint), `.env.example` (full §8 registry), `.gitignore`, `README.md`.

## Acceptance — demonstrated

- `pnpm dev` boots the api; `GET /internal/health` → `200 {"status":"ok","mode":"http","tz":"Asia/Jakarta"}` (verified via curl).
- `next build` prerenders `/`, `/sign-in`, `/_not-found` + middleware under ClerkProvider.
- **CI gate green locally:** `pnpm typecheck` (3/3), `pnpm lint` (0 warnings),
  `pnpm test` (9 tests: 6 config + 3 vocabulary), `pnpm build` (3/3).

## Tests

- `apps/api/src/config.test.ts` — valid parse + defaults, PORT coercion, **missing required →
  ConfigError naming APP_URL + INTERNAL_API_KEY**, invalid URL / short key / bad MODE each
  rejected by name (6 tests).
- `packages/shared/src/constants.test.ts` — queue/stage vocabularies + zod-enum derivation (3).

## Deviations from docs (`[REVISED: reason]`)

- **[REVISED: layout drift]** The four docs sat at the repo root; moved into `docs/` to match
  the authoritative filetree (docs/01 §2) and CLAUDE.md read order. `04-PROMPTS.md` was absent
  from the working tree — extracted from `recall-prd-package.zip` into `docs/`. The zip is
  archived under `docs/_package/`.
- **[REVISED: single lint source]** Chose eslintrc + ESLint 8 + typescript-eslint 7 (one
  root config linting all workspaces in a single pass) over per-package flat configs, and
  disabled Next's build-time lint (`eslint.ignoreDuringBuilds`) so the root config is the sole
  lint authority. `next lint` / `eslint-config-next` intentionally omitted.
- **[REVISED: boot-before-datastores]** Only `APP_URL` + `INTERNAL_API_KEY` (plus defaulted
  runtime keys) are required in `config.ts` today; datastore/provider keys stay optional until
  their phase promotes them. Phase 1 must promote `DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY`.
- **Benign:** turbo prints "no output files" for the `noEmit` build/test tasks (no dist/coverage
  yet). Not a failure; resolves once phases emit coverage.

## Phase-gate checklist

- [x] All acceptance criteria demonstrated (see above)
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green
- [x] Coverage targets met — n/a for Phase 0 (config-parse tests present; 100% gates begin Phase 1)
- [x] New env keys added to registry — `.env.example` mirrors §8; Railway secrets pending deploy
- [x] Deviations recorded with `[REVISED: reason]`
- [x] Golden fixtures updated? — n/a (fixtures land Phase 2/3; README stub in place)

## Handover to Phase 1 — Database, tenancy, auth, pipeline ledger

**Load:** this file, docs/01 §4 (schema) + §7 (auth), Lynkbot `migrate.ts` + `internalApiKey.ts`.
**Then:**
1. Add deps to `apps/api`: `drizzle-orm`, `drizzle-kit`, `postgres` (or `pg`), `ioredis`,
   `bullmq`, `@clerk/backend`. Add `db:migrate` / `db:seed` scripts.
2. Drizzle schema per §4, one file per domain under `db/schema/`; migration 0001 enables
   `pgvector` + ivfflat index on `memories.embedding`.
3. Promote `DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY` to required in `config.ts`
   (they already have optional slots + a `NODE_ENV`-aware pattern to follow).
4. Clerk auth plugin (verify JWT → clerkUserId→tenantId, 5-min cache, decorate `request.auth`);
   deduped `internalApiKey` middleware for internal routes.
5. `pipeline.service.ts`: `startRun` / `stage(runId,name,fn)` / `meterCost` using `RATES_IDR`
   (already in `@recall/shared/constants`).
6. Routes: `GET /internal/health` (add db+redis ping), `/v1/settings/blacklist` + `/contacts`.
7. **QC gate:** 100% coverage on the auth guard + pipeline service. Wire vitest `thresholds`.
