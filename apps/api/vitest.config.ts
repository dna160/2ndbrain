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
      // Global gate is scoped to the unit-testable business core; thin adapters (clients,
      // routes, db, queues, workers, bootstrap) are exercised by the CI integration + E2E
      // journey (docs/03 Phase 8), not the unit suite.
      include: [
        'src/config.ts',
        'src/auth/authenticator.ts',
        'src/middleware/internalApiKey.ts',
        'src/middleware/relayHmac.ts',
        'src/services/pipeline.service.ts',
        'src/services/ingest.service.ts',
        'src/services/media.service.ts',
        'src/services/speaker.service.ts',
        'src/services/waSend.service.ts',
        'src/services/meta/extract.ts',
        'src/services/llm/parse.ts',
        'src/services/memory/math.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      thresholds: {
        // CLAUDE.md global targets, applied to the scoped core.
        statements: 80,
        branches: 75,
        functions: 85,
        lines: 80,
        '**/services/pipeline.service.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        '**/services/ingest.service.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        '**/services/meta/extract.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        '**/services/llm/parse.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        '**/auth/authenticator.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        '**/middleware/relayHmac.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        '**/services/waSend.service.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        '**/services/memory/math.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
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
