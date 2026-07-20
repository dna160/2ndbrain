/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/middleware/relayHmac.ts
 * Role    : Verify the Lynkbot relay signature on POST /ingest/wa (docs/01 §3.4).
 *           [IMPROVED] Lynkbot's Meta-signature has no replay protection; Recall binds the
 *           HMAC to an x-relay-timestamp and rejects stale requests, so a captured relay POST
 *           can't be replayed after the skew window. (Same-message replay within the window is
 *           still absorbed by events.externalId idempotency.)
 * Exports : verifyRelaySignature(), makeRelayHmacGuard()
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

export interface RelayVerifyInput {
  rawBody: string;
  signature: string | undefined;
  timestamp: string | undefined;
  secret: string;
  now: number;
  maxSkewMs: number;
}

export type RelayVerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyRelaySignature(input: RelayVerifyInput): RelayVerifyResult {
  if (!input.signature) return { ok: false, reason: 'missing signature' };
  if (!input.timestamp) return { ok: false, reason: 'missing timestamp' };

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid timestamp' };
  if (Math.abs(input.now - ts) > input.maxSkewMs) return { ok: false, reason: 'stale timestamp' };

  const expected = createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.rawBody}`)
    .digest('hex');
  const provided = Buffer.from(input.signature);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length) return { ok: false, reason: 'signature mismatch' };
  if (!timingSafeEqual(provided, expectedBuf)) return { ok: false, reason: 'signature mismatch' };

  return { ok: true };
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers[name];
  return Array.isArray(header) ? header[0] : header;
}

export type RelayGuard = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export function makeRelayHmacGuard(opts: {
  secret: string;
  maxSkewMs: number;
  now?: () => number;
}): RelayGuard {
  const now = opts.now ?? (() => Date.now());
  return async (request, reply) => {
    const result = verifyRelaySignature({
      rawBody: request.rawBody ?? '',
      signature: headerValue(request, 'x-relay-signature'),
      timestamp: headerValue(request, 'x-relay-timestamp'),
      secret: opts.secret,
      now: now(),
      maxSkewMs: opts.maxSkewMs,
    });
    if (!result.ok) {
      await reply.code(401).send({ error: `relay auth failed: ${result.reason}` });
    }
  };
}
