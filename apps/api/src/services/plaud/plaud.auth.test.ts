import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPlaudTokenProvider, PlaudAuthError, type RefreshTokenStore } from './plaud.auth';

afterEach(() => vi.unstubAllGlobals());

/** In-memory rotation store, seeded empty (falls back to the initial env token). */
function memStore(initial: string | null = null): RefreshTokenStore & { value: string | null } {
  const s = {
    value: initial,
    get: async () => s.value,
    set: async (t: string) => {
      s.value = t;
    },
  };
  return s;
}

function cfg(store: RefreshTokenStore) {
  return {
    refreshUrl: 'https://platform.plaud.ai/developer/api/oauth/third-party/access-token/refresh',
    initialRefreshToken: 'seed-refresh',
    store,
  };
}

function stubToken(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init: { body: URLSearchParams; headers: Record<string, string> }) => ({
    ok,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('createPlaudTokenProvider', () => {
  it('refreshes as form-urlencoded with only the refresh_token (no client id/secret/grant)', async () => {
    const fetchMock = stubToken({ access_token: 'at', expires_in: 3600 });
    await createPlaudTokenProvider(cfg(memStore()), () => 0)();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/oauth/third-party/access-token/refresh');
    expect(init.headers['content-type']).toBe('application/x-www-form-urlencoded');
    const body = init.body as URLSearchParams;
    expect(body.get('refresh_token')).toBe('seed-refresh');
    expect(body.get('client_id')).toBeNull();
    expect(body.get('client_secret')).toBeNull();
    expect(body.get('grant_type')).toBeNull();
  });

  it('seeds from the env token, then uses the rotated token from the store next time', async () => {
    const store = memStore();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'at1', expires_in: 3600, refresh_token: 'rot-1' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'at2', expires_in: 3600, refresh_token: 'rot-2' }) });
    vi.stubGlobal('fetch', fetchMock);
    let t = 0;
    const provider = createPlaudTokenProvider(cfg(store), () => t);

    expect(await provider()).toBe('at1');
    expect(store.value).toBe('rot-1'); // rotation persisted

    t = 4_000_000; // past expiry buffer → refresh again
    expect(await provider()).toBe('at2');
    // Second refresh used the stored rotated token, not the env seed.
    const secondBody = fetchMock.mock.calls[1]![1].body as URLSearchParams;
    expect(secondBody.get('refresh_token')).toBe('rot-1');
    expect(store.value).toBe('rot-2');
  });

  it('caches the access token within its lifetime (one refresh only)', async () => {
    const fetchMock = stubToken({ access_token: 'at', expires_in: 3600 });
    let t = 0;
    const provider = createPlaudTokenProvider(cfg(memStore()), () => t);
    expect(await provider()).toBe('at');
    t = 1_000_000; // < 3600s - 120s buffer
    expect(await provider()).toBe('at');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws PlaudAuthError on a 401 (revoked token) without caching', async () => {
    const fetchMock = stubToken({}, false, 401);
    const provider = createPlaudTokenProvider(cfg(memStore()), () => 0);
    await expect(provider()).rejects.toBeInstanceOf(PlaudAuthError);
    await expect(provider()).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws PlaudAuthError on an unrecognized token shape', async () => {
    stubToken({ nope: true });
    await expect(createPlaudTokenProvider(cfg(memStore()), () => 0)()).rejects.toThrow(/unrecognized shape/);
  });

  it('wraps a network error as PlaudAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    await expect(createPlaudTokenProvider(cfg(memStore()), () => 0)()).rejects.toBeInstanceOf(PlaudAuthError);
  });
});
