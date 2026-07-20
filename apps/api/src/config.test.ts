import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from './config';

const validEnv = {
  APP_URL: 'http://localhost:3000',
  INTERNAL_API_KEY: 'a-sufficiently-long-key',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/recall',
  REDIS_URL: 'redis://localhost:6379',
  CLERK_SECRET_KEY: 'sk_test_dummy',
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'recall-media',
  LYNKBOT_RELAY_SECRET: 'relay-secret-at-least-16',
  META_ACCESS_TOKEN: 'meta-token',
} satisfies NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('parses a minimal valid environment and applies defaults', () => {
    const config = loadConfig(validEnv);
    expect(config.NODE_ENV).toBe('development');
    expect(config.MODE).toBe('http');
    expect(config.PORT).toBe(3001);
    expect(config.TZ_DISPLAY).toBe('Asia/Jakarta');
  });

  it('coerces PORT from a string', () => {
    const config = loadConfig({ ...validEnv, PORT: '8080' });
    expect(config.PORT).toBe(8080);
  });

  it('throws ConfigError naming every missing required key', () => {
    let error: unknown;
    try {
      loadConfig({});
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const issues = (error as ConfigError).issues.join('\n');
    expect(issues).toContain('APP_URL');
    expect(issues).toContain('INTERNAL_API_KEY');
    expect(issues).toContain('DATABASE_URL');
    expect(issues).toContain('REDIS_URL');
    expect(issues).toContain('CLERK_SECRET_KEY');
  });

  it('rejects an invalid APP_URL by name', () => {
    expect(() => loadConfig({ ...validEnv, APP_URL: 'not-a-url' })).toThrow(/APP_URL/);
  });

  it('rejects an INTERNAL_API_KEY that is too short by name', () => {
    expect(() => loadConfig({ ...validEnv, INTERNAL_API_KEY: 'short' })).toThrow(
      /INTERNAL_API_KEY/,
    );
  });

  it('rejects an invalid MODE by name', () => {
    expect(() => loadConfig({ ...validEnv, MODE: 'sideways' })).toThrow(/MODE/);
  });
});
