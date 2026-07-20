# Recall

A WhatsApp-native second brain for a strategic operator in Jakarta. Ingests WhatsApp
messages/voice notes (via the Lynkbot WABA relay), audio uploads, and Google Calendar;
produces Plaud-grade meeting notes, a three-tier graph memory, a nightly digest, and
pre-meeting briefs — delivered back over WhatsApp.

> **Building this?** Read `CLAUDE.md` first, then `docs/00-PRD.md` → `docs/04-PROMPTS.md`
> in order. Work one phase at a time (`docs/03-BUILD-PHASES.md`); record each in
> `docs/progress/PHASE-N-DONE.md`.

## Monorepo layout

```
recall/
├── apps/
│   ├── api/          # Fastify HTTP + BullMQ worker (same image, MODE switch)
│   └── web/          # Next.js 14 App Router + Clerk dashboard
├── packages/
│   └── shared/       # zod schemas + types + constants — the API contract source of truth
├── docs/             # PRD, architecture, design system, build phases, prompts, progress/
├── fixtures/         # golden test fixtures
└── infra/            # Railway config + Dockerfiles
```

## Toolchain

pnpm workspaces · Turborepo · TypeScript (strict) · Fastify 5 · Next 14 · Vitest ·
ESLint 8 + typescript-eslint. Node ≥ 20.11, pnpm 9.15.

## Commands

```bash
pnpm install          # bootstrap the workspace
pnpm dev              # api (:3001) + web (:3000)
pnpm typecheck        # tsc --noEmit across workspaces
pnpm lint             # eslint, zero warnings
pnpm test             # vitest
pnpm build            # build all workspaces
```

Copy `.env.example` → `.env` before running. Config is validated fail-fast in
`apps/api/src/config.ts`.

## Status

**Phase 0 — Scaffold & CI.** See `docs/progress/` for the running build log.
# 2ndbrain
