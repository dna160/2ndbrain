import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests spin up a testcontainer; give them room.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/index.ts', 'src/worker.ts'],
      // CLAUDE.md QC gate: 100% on the auth guard + pipeline service + cost metering.
      thresholds: {
        '**/services/pipeline.service.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        '**/auth/authenticator.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        '**/middleware/internalApiKey.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
