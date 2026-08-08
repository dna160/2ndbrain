import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPlaudTokenProvider, PlaudAuthError } from './plaud.auth';

afterEach(() => vi.unstubAllGlobals());

const cfg = {
  refreshUrl: 'https://plaud.test/auth/refresh',
  clientId: 'cid',
  clientSecret: 'secret',
  refreshToken: 'refresh-tok',
};

function stubToken(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => ({ ok, status, json: async () => body }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('createPlaudTokenProvider', () => {
  it('mints an access token and caches it until the halfway mark', async () => {
    const fetchMock = stubToken({ access_token: 'at-1', expires_in: 3600 });
    let t = 1_000_000;
    const provider = createPlaudTokenProvider(cfg, () => t);

    expect(await provider()).toBe('at-1');
    t += 1_000_000; // < 1800s later → still cached
    expect(await provider()).toBe('at-1');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('refreshes once past 50% of lifetime', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'at-1', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'at-2', expires_in: 3600 }) });
    vi.stubGlobal('fetch', fetchMock);
    let t = 0;
    const provider = createPlaudTokenProvider(cfg, () => t);

    expect(await provider()).toBe('at-1');
    t = 1_800_001; // just past half of 3600s
    expect(await provider()).toBe('at-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends the refresh grant, never exposing the refresh token in the URL', async () => {
    const fetchMock = stubToken({ access_token: 'at', expires_in: 3600 });
    await createPlaudTokenProvider(cfg, () => 0)();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(cfg.refreshUrl);
    const body = JSON.parse(init.body) as { grant_type: string; refresh_token: string };
    expect(body.grant_type).toBe('refresh_token');
    expect(body.refresh_token).toBe('refresh-tok');
  });

  it('throws PlaudAuthError on a 401 (revoked token) and does not cache', async () => {
    const fetchMock = stubToken({}, false, 401);
    const provider = createPlaudTokenProvider(cfg, () => 0);
    await expect(provider()).rejects.toBeInstanceOf(PlaudAuthError);
    await expect(provider()).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(2); // no stale cache served
  });

  it('throws PlaudAuthError on an unrecognized token shape', async () => {
    stubToken({ nope: true });
    await expect(createPlaudTokenProvider(cfg, () => 0)()).rejects.toThrow(/unrecognized shape/);
  });

  it('wraps a network error as PlaudAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    await expect(createPlaudTokenProvider(cfg, () => 0)()).rejects.toBeInstanceOf(PlaudAuthError);
  });
});
