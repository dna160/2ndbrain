/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/memory/embeddings.ts
 * Role    : BGE-M3 embeddings (1024-dim, matches memories.embedding) via a TEI-style endpoint.
 *           Behind an interface so consolidation/retrieval are testable without the model.
 */
export interface EmbeddingsProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export class Bge3EmbeddingsProvider implements EmbeddingsProvider {
  constructor(
    private readonly apiKey: string,
    private readonly url: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ inputs: texts }),
    });
    if (!res.ok) throw new Error(`embeddings failed: ${res.status}`);
    return (await res.json()) as number[][];
  }
}

interface CloudflareAiResponse {
  result?: { data?: number[][] };
  success?: boolean;
  errors?: Array<{ message?: string }>;
}

/**
 * Cloudflare Workers AI (`@cf/baai/bge-m3`, 1024-dim). Same model as TEI, different envelope:
 * request is `{ text: [...] }` and the vectors come back under `result.data`.
 * EMBEDDINGS_URL = https://api.cloudflare.com/client/v4/accounts/<id>/ai/run/@cf/baai/bge-m3
 */
export class CloudflareEmbeddingsProvider implements EmbeddingsProvider {
  constructor(
    private readonly apiKey: string,
    private readonly url: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: texts }),
    });
    if (!res.ok) throw new Error(`embeddings failed: ${res.status}`);
    const json = (await res.json()) as CloudflareAiResponse;
    const data = json.result?.data;
    if (!data) {
      const detail = json.errors?.[0]?.message ?? 'no result.data in response';
      throw new Error(`embeddings failed: ${detail}`);
    }
    return data;
  }
}
