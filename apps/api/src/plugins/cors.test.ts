import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { allowedOriginsFrom, registerCors } from './cors';

const WEB = 'https://recall-web-production-5d2c.up.railway.app';

describe('allowedOriginsFrom', () => {
  it('always allows APP_URL', () => {
    expect(allowedOriginsFrom({ appUrl: WEB, isProduction: true })).toContain(WEB);
  });

  it('strips a trailing slash so APP_URL matches the Origin header format', () => {
    expect(allowedOriginsFrom({ appUrl: `${WEB}/`, isProduction: true })).toEqual([WEB]);
  });

  it('adds localhost only outside production', () => {
    expect(allowedOriginsFrom({ appUrl: WEB, isProduction: false })).toContain('http://localhost:3000');
    expect(allowedOriginsFrom({ appUrl: WEB, isProduction: true })).not.toContain('http://localhost:3000');
  });

  it('appends comma-separated extras and de-duplicates', () => {
    const out = allowedOriginsFrom({
      appUrl: WEB,
      isProduction: true,
      extra: `https://a.example, https://b.example, ${WEB}`,
    });
    expect(out).toEqual([WEB, 'https://a.example', 'https://b.example']);
  });
});

async function appWith(origin: string | undefined, isProduction = true) {
  const app = Fastify();
  registerCors(app, { appUrl: WEB, isProduction });
  app.get('/v1/threads', async () => ({ ok: true }));
  await app.ready();
  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/v1/threads',
    headers: {
      ...(origin ? { origin } : {}),
      'access-control-request-method': 'GET',
    },
  });
  await app.close();
  return preflight;
}

describe('registerCors', () => {
  it('answers the browser preflight for the web origin', async () => {
    const res = await appWith(WEB);
    // Without CORS registered this route 404s — that is the bug this guards.
    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(WEB);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('permits the Authorization header so Clerk tokens can be sent', async () => {
    const res = await appWith(WEB);
    expect(String(res.headers['access-control-allow-headers'])).toMatch(/Authorization/i);
  });

  it('does not grant access to an unlisted origin', async () => {
    const res = await appWith('https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not grant access to an arbitrary railway app', async () => {
    // Lynkbot's version allowed any *.up.railway.app; with credentials:true that would let
    // any app on Railway call this API as the signed-in user.
    const res = await appWith('https://someone-elses-app.up.railway.app');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
