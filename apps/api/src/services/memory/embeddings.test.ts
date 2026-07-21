import { afterEach, describe, expect, it, vi } from 'vitest';

import { CloudflareEmbeddingsProvider } from './embeddings';

afterEach(() => vi.unstubAllGlobals());

const provider = () =>
  new CloudflareEmbeddingsProvider(
    'cf-token',
    'https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/baai/bge-m3',
  );

describe('CloudflareEmbeddingsProvider', () => {
  it('unwraps result.data into vectors', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => ({
      ok: true,
      json: async () => ({ success: true, result: { shape: [2, 3], data: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const vectors = await provider().embed(['a', 'b']);
    expect(vectors).toEqual([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);

    // Workers AI expects { text: [...] }, not TEI's { inputs: [...] }
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body ?? '{}') as { text?: string[] };
    expect(body.text).toEqual(['a', 'b']);
  });

  it('short-circuits on an empty batch without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(provider().embed([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
    await expect(provider().embed(['a'])).rejects.toThrow(/401/);
  });

  it('surfaces a Cloudflare error payload when result.data is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: false, errors: [{ message: 'Authentication error' }] }),
      })),
    );
    await expect(provider().embed(['a'])).rejects.toThrow(/Authentication error/);
  });
});
