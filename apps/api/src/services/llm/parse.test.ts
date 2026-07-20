import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { extractJson, parseStructured } from './parse';
import type { LlmClient } from './types';

const schema = z.object({ a: z.number() });

function client(responses: string[]): LlmClient {
  let i = 0;
  return {
    chat: vi.fn(async () => ({
      content: responses[i++] ?? '{}',
      modelId: 'deepseek-reasoner',
      usage: { promptTokens: 10, completionTokens: 5 },
      latencyMs: 1,
    })),
  };
}

const req = { schema, system: 'sys', user: 'usr', model: 'deepseek-reasoner', temperature: 0.3 };

describe('extractJson', () => {
  it('returns trimmed input when there is no fence', () => {
    expect(extractJson('  {"a":1}  ')).toBe('{"a":1}');
  });
  it('extracts JSON from a ```json fence', () => {
    expect(extractJson('```json\n{"a":2}\n```')).toBe('{"a":2}');
  });
});

describe('parseStructured', () => {
  it('parses a valid first response (no repair)', async () => {
    const llm = client(['{"a":1}']);
    const result = await parseStructured(llm, req);
    expect(result.data).toEqual({ a: 1 });
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    expect(llm.chat).toHaveBeenCalledOnce();
  });

  it('rescues fenced JSON', async () => {
    const result = await parseStructured(client(['```json\n{"a":2}\n```']), req);
    expect(result.data).toEqual({ a: 2 });
  });

  it('repairs unparseable JSON on the second attempt and sums usage', async () => {
    const llm = client(['not json at all', '{"a":3}']);
    const result = await parseStructured(llm, req);
    expect(result.data).toEqual({ a: 3 });
    expect(result.usage).toEqual({ promptTokens: 20, completionTokens: 10 });
    expect(llm.chat).toHaveBeenCalledTimes(2);
  });

  it('repairs schema-invalid JSON (parses but wrong shape)', async () => {
    const result = await parseStructured(client(['{"a":"not-a-number"}', '{"a":4}']), req);
    expect(result.data).toEqual({ a: 4 });
  });

  it('throws when the repair also fails', async () => {
    await expect(parseStructured(client(['bad', 'still bad']), req)).rejects.toThrow(/after repair/);
  });
});
