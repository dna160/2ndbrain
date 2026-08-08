/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/plaud/plaud.auth.ts
 * Role    : Mint short-lived Plaud access tokens from a long-lived PLAUD_REFRESH_TOKEN
 *           (docs/05 §3.2). Railway has no browser, so `plaud login` runs once on the
 *           operator's laptop and only the refresh token becomes a Railway secret. Access
 *           tokens are cached in memory and refreshed proactively at 50% of lifetime; token
 *           material never touches disk, logs, or pipeline_runs.
 * Exports : PlaudAuthError, PlaudTokenProvider, createPlaudTokenProvider
 */
import { plaudTokenResponseSchema } from '@recall/shared';

/** Distinct error type so the sync loop can treat auth failure as P1 (halt), not retry-forever. */
export class PlaudAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaudAuthError';
  }
}

export interface PlaudAuthConfig {
  refreshUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export type PlaudTokenProvider = () => Promise<string>;

interface CachedToken {
  token: string;
  /** Epoch ms after which the token must be refreshed (already halved from real expiry). */
  refreshAfter: number;
}

/**
 * Returns a function that yields a valid access token, refreshing when the cached one is past
 * the halfway mark. `now` is injectable for tests. A refresh failure throws PlaudAuthError and
 * clears the cache, so the next call retries a fresh exchange rather than serving a stale token.
 */
export function createPlaudTokenProvider(
  cfg: PlaudAuthConfig,
  now: () => number = () => Date.now(),
): PlaudTokenProvider {
  let cached: CachedToken | null = null;

  return async () => {
    if (cached && now() < cached.refreshAfter) return cached.token;

    let res: Response;
    try {
      res = await fetch(cfg.refreshUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          refresh_token: cfg.refreshToken,
        }),
      });
    } catch (err) {
      cached = null;
      throw new PlaudAuthError(`plaud token refresh network error: ${String(err)}`);
    }

    if (!res.ok) {
      cached = null;
      // 401 here means the refresh token was revoked/expired — a P1 the operator must fix,
      // never a value to log. The status is enough to diagnose.
      throw new PlaudAuthError(`plaud token refresh failed: ${res.status}`);
    }

    const parsed = plaudTokenResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      cached = null;
      throw new PlaudAuthError('plaud token refresh returned an unrecognized shape');
    }

    cached = {
      token: parsed.data.access_token,
      refreshAfter: now() + (parsed.data.expires_in * 1000) / 2,
    };
    return cached.token;
  };
}
