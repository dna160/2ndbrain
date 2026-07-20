/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/middleware/internalApiKey.ts
 * Role    : Guards /internal/* routes with the X-Internal-Api-Key header
 *           (deduped from Lynkbot apps/api/src/middleware/internalApiKey.ts).
 *           [IMPROVED: timing-safe] Lynkbot uses a plain `!==`; Recall compares in constant
 *           time to avoid leaking the key via response timing.
 * Exports : isValidInternalKey(), makeInternalApiKeyGuard()
 */
import { timingSafeEqual } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

/** 2-arg async preHandler — assignable to Fastify's hook slot, and directly unit-testable. */
export type InternalApiKeyGuard = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export function isValidInternalKey(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual requires equal-length buffers; unequal length ⇒ not a match.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Fastify preHandler matching Lynkbot's interface — 401s an invalid/missing internal key. */
export function makeInternalApiKeyGuard(expectedKey: string): InternalApiKeyGuard {
  return async (request, reply) => {
    const header = request.headers['x-internal-api-key'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!isValidInternalKey(provided, expectedKey)) {
      await reply.code(401).send({ error: 'invalid internal API key' });
    }
  };
}
