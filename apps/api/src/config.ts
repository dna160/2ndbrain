/**
 * Environment configuration — parsed and validated with zod, fail-fast (docs/03 Phase 0).
 *
 * `loadConfig` is pure and takes an env bag so it is trivially testable. Application
 * bootstraps (index.ts / worker.ts) call it once at startup; a validation failure throws
 * an Error whose message NAMES every offending key, then the process exits non-zero.
 *
 * Registry: docs/01-ARCHITECTURE.md §8. Keys are `optional()` until the phase that first
 * needs them promotes them to required — that keeps `pnpm dev` bootable before datastores
 * and providers exist. The promotion phase is noted inline.
 */
import { z } from 'zod';

const ConfigSchema = z.object({
  // ── Runtime (Phase 0, required) ──────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MODE: z.enum(['http', 'worker']).default('http'),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  APP_URL: z.string().url({ message: 'must be a valid URL (e.g. http://localhost:3000)' }),
  INTERNAL_API_KEY: z.string().min(16, 'must be at least 16 characters'),
  TZ_DISPLAY: z.string().min(1).default('Asia/Jakarta'),

  // ── Datastores (Phase 1, required) ───────────────────────────────────────
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // ── Auth: Clerk (Phase 1 api, required) ──────────────────────────────────
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),

  // ── Object storage: Cloudflare R2 (Phase 2) ──────────────────────────────
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),

  // ── Model providers (Phase 3 / 6) ────────────────────────────────────────
  GROQ_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  EMBEDDINGS_API_KEY: z.string().optional(),

  // ── Lynkbot relay + WhatsApp send (Phase 2 / 5) ──────────────────────────
  LYNKBOT_RELAY_SECRET: z.string().optional(),
  LYNKBOT_INTERNAL_URL: z.string().url().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Thrown when the environment fails validation; `.message` lists every offending key. */
export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Parse + validate an environment bag. Pure: pass an explicit bag in tests.
 * @throws {ConfigError} naming each invalid/missing key.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const key = issue.path.join('.') || '(root)';
      return `${key}: ${issue.message}`;
    });
    throw new ConfigError(issues);
  }
  return result.data;
}
