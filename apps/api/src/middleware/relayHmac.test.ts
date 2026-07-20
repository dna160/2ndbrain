import { createHmac } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { makeRelayHmacGuard, verifyRelaySignature } from './relayHmac';

const secret = 'relay-secret-at-least-16';
const body = '{"hello":"world"}';
const now = 1_700_000_000_000;

function sign(ts: number, rawBody: string): string {
  return createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
}

describe('verifyRelaySignature', () => {
  const base = { rawBody: body, secret, now, maxSkewMs: 300_000 };

  it('accepts a fresh, correctly signed request', () => {
    expect(verifyRelaySignature({ ...base, timestamp: String(now), signature: sign(now, body) })).toEqual({ ok: true });
  });
  it('rejects a missing signature', () => {
    expect(verifyRelaySignature({ ...base, timestamp: String(now), signature: undefined })).toMatchObject({ ok: false });
  });
  it('rejects a missing timestamp', () => {
    expect(verifyRelaySignature({ ...base, timestamp: undefined, signature: 'x' })).toMatchObject({ reason: 'missing timestamp' });
  });
  it('rejects a non-numeric timestamp', () => {
    expect(verifyRelaySignature({ ...base, timestamp: 'abc', signature: 'x' })).toMatchObject({ reason: 'invalid timestamp' });
  });
  it('rejects a stale timestamp (replay)', () => {
    const old = now - 400_000;
    expect(verifyRelaySignature({ ...base, timestamp: String(old), signature: sign(old, body) })).toMatchObject({ reason: 'stale timestamp' });
  });
  it('rejects a signature of the wrong length', () => {
    expect(verifyRelaySignature({ ...base, timestamp: String(now), signature: 'deadbeef' })).toMatchObject({ reason: 'signature mismatch' });
  });
  it('rejects a same-length but wrong signature', () => {
    const wrong = sign(now, 'different-body');
    expect(verifyRelaySignature({ ...base, timestamp: String(now), signature: wrong })).toMatchObject({ reason: 'signature mismatch' });
  });
});

function fakeReq(headers: Record<string, string>): FastifyRequest {
  return { headers, rawBody: body } as unknown as FastifyRequest;
}
function fakeReply() {
  const reply = { statusCode: 0, send: vi.fn(async () => reply), code(c: number) { reply.statusCode = c; return reply; } };
  return reply;
}

describe('makeRelayHmacGuard', () => {
  it('passes a valid request through', async () => {
    const guard = makeRelayHmacGuard({ secret, maxSkewMs: 300_000, now: () => now });
    const reply = fakeReply();
    await guard(
      fakeReq({ 'x-relay-timestamp': String(now), 'x-relay-signature': sign(now, body) }),
      reply as unknown as FastifyReply,
    );
    expect(reply.statusCode).toBe(0);
  });

  it('401s an invalid request', async () => {
    const guard = makeRelayHmacGuard({ secret, maxSkewMs: 300_000, now: () => now });
    const reply = fakeReply();
    await guard(fakeReq({ 'x-relay-timestamp': String(now), 'x-relay-signature': 'bad' }), reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(401);
  });

  it('uses the default clock when none is injected', async () => {
    const guard = makeRelayHmacGuard({ secret, maxSkewMs: 300_000 }); // no now → Date.now()
    const reply = fakeReply();
    await guard(fakeReq({ 'x-relay-timestamp': String(now) }), reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(401); // missing signature
  });

  it('treats a missing raw body as empty', async () => {
    const guard = makeRelayHmacGuard({ secret, maxSkewMs: 300_000, now: () => now });
    const reply = fakeReply();
    const req = {
      headers: { 'x-relay-timestamp': String(now), 'x-relay-signature': 'x' },
    } as unknown as FastifyRequest;
    await guard(req, reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(401);
  });

  it('reads the first value of array-valued headers', async () => {
    const guard = makeRelayHmacGuard({ secret, maxSkewMs: 300_000, now: () => now });
    const reply = fakeReply();
    const req = {
      headers: { 'x-relay-timestamp': [String(now)], 'x-relay-signature': [sign(now, body)] },
      rawBody: body,
    } as unknown as FastifyRequest;
    await guard(req, reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(0);
  });
});
