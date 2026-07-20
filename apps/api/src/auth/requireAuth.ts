/**
 * Fastify preHandler that enforces auth on a route scope: populates `request.auth` or
 * replies with the AuthError status (401 missing/invalid, 403 unprovisioned).
 */
import type { preHandlerHookHandler } from 'fastify';

import { AuthError, type Authenticate } from './authenticator';

export function makeRequireAuth(authenticate: Authenticate): preHandlerHookHandler {
  return async (request, reply) => {
    try {
      request.auth = await authenticate(request.headers.authorization);
    } catch (err) {
      if (err instanceof AuthError) {
        await reply.code(err.statusCode).send({ error: err.message });
        return;
      }
      throw err;
    }
  };
}
