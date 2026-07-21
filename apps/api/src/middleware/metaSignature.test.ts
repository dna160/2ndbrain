import { createHmac } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { makeMetaSignatureGuard, verifyMetaSignature } from './metaSignature';

const appSecret = 'da5cbd8dce8821884b190b2a344387ad';
const body = '{"object":"whatsapp_business_account","entry":[]}';

function sign(rawBody: string, secret = appSecret): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

describe('verifyMetaSignature', () => {
  const base = { rawBody: body, appSecret };

  it('accepts a correctly signed body', () => {
    expect(verifyMetaSignature({ ...base, signature: sign(body) })).toEqual({ ok: true });
  });

  it('rejects a missing signature', () => {
    expect(verifyMetaSignature({ ...base, signature: undefined })).toMatchObject({
      reason: 'missing signature',
    });
  });

  it('rejects a signature of the wrong length', () => {
    expect(verifyMetaSignature({ ...base, signature: 'sha256=deadbeef' })).toMatchObject({
      reason: 'signature mismatch',
    });
  });

  it('rejects a same-length signature over different bytes (tampered payload)', () => {
    expect(verifyMetaSignature({ ...base, signature: sign('{"object":"tampered"}') })).toMatchObject({
      reason: 'signature mismatch',
    });
  });

  it('rejects a signature made with the wrong app secret', () => {
    expect(verifyMetaSignature({ ...base, signature: sign(body, 'wrong-secret') })).toMatchObject({
      reason: 'signature mismatch',
    });
  });

  it('requires the sha256= prefix Meta sends', () => {
    const bare = createHmac('sha256', appSecret).update(body).digest('hex');
    expect(verifyMetaSignature({ ...base, signature: bare })).toMatchObject({
      reason: 'signature mismatch',
    });
  });
});

function fakeReply() {
  const reply = {
    statusCode: 0,
    send: vi.fn(async () => reply),
    code(c: number) {
      reply.statusCode = c;
      return reply;
    },
  };
  return reply;
}

describe('makeMetaSignatureGuard', () => {
  const guard = makeMetaSignatureGuard({ appSecret });

  it('passes a validly signed request through', async () => {
    const reply = fakeReply();
    const req = { headers: { 'x-hub-signature-256': sign(body) }, rawBody: body } as unknown as FastifyRequest;
    await guard(req, reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(0);
  });

  it('401s an unsigned request — there is no dev bypass', async () => {
    const reply = fakeReply();
    await guard({ headers: {}, rawBody: body } as unknown as FastifyRequest, reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(401);
  });

  it('401s a forged signature', async () => {
    const reply = fakeReply();
    const req = { headers: { 'x-hub-signature-256': sign(body, 'attacker') }, rawBody: body } as unknown as FastifyRequest;
    await guard(req, reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(401);
  });

  it('treats a missing raw body as empty rather than throwing', async () => {
    const reply = fakeReply();
    const req = { headers: { 'x-hub-signature-256': sign(body) } } as unknown as FastifyRequest;
    await guard(req, reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(401);
  });

  it('reads the first value of an array-valued header', async () => {
    const reply = fakeReply();
    const req = { headers: { 'x-hub-signature-256': [sign(body)] }, rawBody: body } as unknown as FastifyRequest;
    await guard(req, reply as unknown as FastifyReply);
    expect(reply.statusCode).toBe(0);
  });
});
