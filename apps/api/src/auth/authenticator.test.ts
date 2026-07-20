import { describe, expect, it, vi } from 'vitest';

import { AuthError, createAuthenticator, extractBearer } from './authenticator';

describe('extractBearer', () => {
  it('returns null for a missing header', () => {
    expect(extractBearer(undefined)).toBeNull();
  });
  it('returns null for a non-bearer scheme', () => {
    expect(extractBearer('Basic abc')).toBeNull();
  });
  it('returns null when the token is absent', () => {
    expect(extractBearer('Bearer')).toBeNull();
  });
  it('extracts the token case-insensitively', () => {
    expect(extractBearer('bearer tok-123')).toBe('tok-123');
  });
});

describe('createAuthenticator', () => {
  const goodVerify = vi.fn(async (t: string) => (t === 'good' ? { sub: 'user_1' } : null));
  const resolve = vi.fn(async (id: string) =>
    id === 'user_1' ? { userId: 'u1', tenantId: 't1' } : null,
  );

  it('throws 401 when the bearer token is missing', async () => {
    const auth = createAuthenticator({ verify: goodVerify, resolveTenant: resolve });
    await expect(auth(undefined)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 when the token is invalid', async () => {
    const auth = createAuthenticator({ verify: goodVerify, resolveTenant: resolve });
    await expect(auth('Bearer bad')).rejects.toBeInstanceOf(AuthError);
  });

  it('throws 403 when the user is not provisioned', async () => {
    const verify = vi.fn(async () => ({ sub: 'ghost' }));
    const auth = createAuthenticator({ verify, resolveTenant: resolve });
    await expect(auth('Bearer good')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('resolves the auth context on success', async () => {
    const auth = createAuthenticator({ verify: goodVerify, resolveTenant: resolve });
    await expect(auth('Bearer good')).resolves.toEqual({
      clerkUserId: 'user_1',
      userId: 'u1',
      tenantId: 't1',
    });
  });

  it('caches the tenant resolution within the TTL', async () => {
    const verify = vi.fn(async () => ({ sub: 'user_1' }));
    const resolveSpy = vi.fn(async () => ({ userId: 'u1', tenantId: 't1' }));
    let clock = 0;
    const auth = createAuthenticator({
      verify,
      resolveTenant: resolveSpy,
      cacheTtlMs: 1000,
      now: () => clock,
    });
    await auth('Bearer good');
    clock = 500; // within TTL → cache hit
    await auth('Bearer good');
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    clock = 2000; // past TTL → re-resolve
    await auth('Bearer good');
    expect(resolveSpy).toHaveBeenCalledTimes(2);
  });
});
