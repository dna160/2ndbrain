import { defineConfig } from '@playwright/test';

// Phase 8 E2E (docs/03). Runs in CI with browsers + a seeded stack (api+worker+web against
// testcontainers Postgres/Redis, externals mocked). `pnpm --filter @recall/web test:e2e`.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
});
