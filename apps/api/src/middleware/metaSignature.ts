/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/middleware/metaSignature.ts
 * Role    : Verify Meta's X-Hub-Signature-256 HMAC on inbound WhatsApp webhooks, using
 *           META_APP_SECRET over the exact raw bytes (app.ts preserves request.rawBody).
 *           Adapted from Lynkbot apps/api/src/middleware/metaSignature.ts with two changes:
 *           (1) timingSafeEqual instead of Buffer.equals — the original compare leaked timing;
 *           (2) no dev bypass — Recall's config fail-fasts, so the secret is always present
 *               and a missing signature is always a 401 rather than a silent pass-through.
 * Exports : verifyMetaSignature(), makeMetaSignatureGuard()
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

export interface MetaVerifyInput {
  rawBody: string;
  signature: string | undefined;
  appSecret: string;
}

export type MetaVerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyMetaSignature(input: MetaVerifyInput): MetaVerifyResult {
  if (!input.signature) return { ok: false, reason: 'missing signature' };

  const expected = `sha256=${createHmac('sha256', input.appSecret).update(input.rawBody).digest('hex')}`;
  const provided = Buffer.from(input.signature);
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so length is checked first — this leaks only
  // the signature's length, which is fixed for sha256 anyway.
  if (provided.length !== expectedBuf.length) return { ok: false, reason: 'signature mismatch' };
  if (!timingSafeEqual(provided, expectedBuf)) return { ok: false, reason: 'signature mismatch' };

  return { ok: true };
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers[name];
  return Array.isArray(header) ? header[0] : header;
}

export type MetaSignatureGuard = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export function makeMetaSignatureGuard(opts: { appSecret: string }): MetaSignatureGuard {
  return async (request, reply) => {
    const result = verifyMetaSignature({
      rawBody: request.rawBody ?? '',
      signature: headerValue(request, 'x-hub-signature-256'),
      appSecret: opts.appSecret,
    });
    if (!result.ok) {
      await reply.code(401).send({ error: `meta signature failed: ${result.reason}` });
    }
  };
}
