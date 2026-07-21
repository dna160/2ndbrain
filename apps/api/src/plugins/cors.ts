/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/plugins/cors.ts
 * Role    : CORS for the browser dashboard. api and web are separate Railway services on
 *           different origins, so every /v1 call is cross-origin and preflights first.
 *           Adapted from Lynkbot apps/api/src/plugins/cors.ts, tightened: Lynkbot allows any
 *           `*.up.railway.app` origin, which with credentials:true would let ANY app deployed
 *           on Railway call this API with the user's cookies. Recall allows exactly APP_URL
 *           (the web origin) plus localhost for dev, and an optional CORS_ORIGIN list.
 * Exports : allowedOriginsFrom(), registerCors()
 */
import fastifyCors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

const LOCALHOST_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

export function allowedOriginsFrom(opts: {
  appUrl: string;
  isProduction: boolean;
  extra?: string;
}): string[] {
  const extra = (opts.extra ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Trailing slashes never appear in an Origin header; strip so APP_URL is forgiving.
  const appOrigin = opts.appUrl.replace(/\/+$/, '');
  return [...new Set([appOrigin, ...(opts.isProduction ? [] : LOCALHOST_ORIGINS), ...extra])];
}

export function registerCors(app: FastifyInstance, opts: {
  appUrl: string;
  isProduction: boolean;
  extra?: string;
}): void {
  const allowed = allowedOriginsFrom(opts);
  void app.register(fastifyCors, {
    origin: (origin, callback) => {
      // No Origin header = server-to-server (Meta webhooks, curl, health checks) — not a
      // browser request, so CORS does not apply and there is nothing to protect against.
      if (!origin) return callback(null, true);
      callback(null, allowed.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  });
}
