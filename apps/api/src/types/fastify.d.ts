import type { AuthContext } from '../auth/authenticator';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by the requireAuth preHandler on authenticated /v1 routes. */
    auth?: AuthContext;
    /** Raw request body string, preserved for relay HMAC verification on /ingest/wa. */
    rawBody?: string;
  }
}
