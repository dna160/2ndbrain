import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { isValidInternalKey, makeInternalApiKeyGuard } from './internalApiKey';

function fakeReq(header: string | string[] | undefined): FastifyRequest {
  return { headers: { 'x-internal-api-key': header } } as unknown as FastifyRequest;
}

interface FakeReply {
  statusCode: number;
  body: unknown;
  code(c: number): FakeReply;
  send: ReturnType<typeof vi.fn>;
}

function fakeReply(): FakeReply {
  const reply: FakeReply = {
    statusCode: 0,
    body: undefined,
    code(c: number) {
      reply.statusCode = c;
      return reply;
    },
    send: vi.fn(async (b: unknown) => {
      reply.body = b;
      return reply;
    }),
  };
  return reply;
}

describe('isValidInternalKey', () => {
  const expected = 'super-secret-internal-key';

  it('rejects a missing key', () => {
    expect(isValidInternalKey(undefined, expected)).toBe(false);
  });
  it('rejects a key of different length', () => {
    expect(isValidInternalKey('short', expected)).toBe(false);
  });
  it('rejects a same-length but different key', () => {
    expect(isValidInternalKey('x'.repeat(expected.length), expected)).toBe(false);
  });
  it('accepts an exact match', () => {
    expect(isValidInternalKey(expected, expected)).toBe(true);
  });
});

describe('makeInternalApiKeyGuard', () => {
  const expected = 'super-secret-internal-key';

  it('passes a valid key through without replying', async () => {
    const guard = makeInternalApiKeyGuard(expected);
    const reply = fakeReply();
    await guard(fakeReq(expected), reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(0);
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('401s a missing key', async () => {
    const guard = makeInternalApiKeyGuard(expected);
    const reply = fakeReply();
    await guard(fakeReq(undefined), reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(401);
  });

  it('401s an invalid key', async () => {
    const guard = makeInternalApiKeyGuard(expected);
    const reply = fakeReply();
    await guard(fakeReq('nope'), reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(401);
  });

  it('uses the first value when the header is an array', async () => {
    const guard = makeInternalApiKeyGuard(expected);
    const reply = fakeReply();
    await guard(fakeReq([expected, 'other']), reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(0);
  });
});
