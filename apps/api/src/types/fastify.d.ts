import type { AuthContext } from '../auth/authenticator';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by the requireAuth preHandler on authenticated /v1 routes. */
    auth?: AuthContext;
  }
}
