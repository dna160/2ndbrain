/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/plaud/plaud.auth.ts
 * Role    : Mint short-lived Plaud access tokens from a rotating refresh token (docs/05 §3.2).
 *           Reverse-engineered from @plaud-ai/cli: the refresh is a form-urlencoded POST whose
 *           ONLY field is `refresh_token` — no client_id/secret/grant_type (the client is a
 *           public PKCE client; those are used only in the browser login, which happens off-box).
 *           CRITICAL: the refresh ROTATES — the response carries a NEW refresh_token that must be
 *           persisted, or the next refresh fails. A stateless env-var-only worker would work once
 *           then break, so the live token is kept in a store (Redis) seeded from the env value.
 * Exports : PlaudAuthError, PlaudTokenProvider, RefreshTokenStore, createPlaudTokenProvider
 */
import { plaudTokenResponseSchema } from '@recall/shared';

/** Distinct error type so the sync loop can treat auth failure as P1 (halt), not retry-forever. */
export class PlaudAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaudAuthError';
  }
}

/** Persistence for the rotating refresh token. Seeded from the env value on first use. */
export interface RefreshTokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
}

export interface PlaudAuthConfig {
  refreshUrl: string;
  /** Env-provided seed; used only until the first rotation lands in the store. */
  initialRefreshToken: string;
  store: RefreshTokenStore;
}

export type PlaudTokenProvider = () => Promise<string>;

interface CachedAccess {
  token: string;
  /** Epoch ms after which the access token must be refreshed (with a safety buffer). */
  refreshAfter: number;
}

/** Refresh this many ms before real expiry so an in-flight request never uses a dead token. */
const EXPIRY_BUFFER_MS = 120_000;

export function createPlaudTokenProvider(
  cfg: PlaudAuthConfig,
  now: () => number = () => Date.now(),
): PlaudTokenProvider {
  let cached: CachedAccess | null = null;

  return async () => {
    if (cached && now() < cached.refreshAfter) return cached.token;

    const currentRefresh = (await cfg.store.get()) ?? cfg.initialRefreshToken;

    let res: Response;
    try {
      res = await fetch(cfg.refreshUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ refresh_token: currentRefresh }),
      });
    } catch (err) {
      cached = null;
      throw new PlaudAuthError(`plaud token refresh network error: ${String(err)}`);
    }

    if (!res.ok) {
      cached = null;
      // 401 → the refresh token was revoked/expired: a P1 the operator must re-login for. The
      // status is enough to diagnose; the token value never enters the message.
      throw new PlaudAuthError(`plaud token refresh failed: ${res.status}`);
    }

    const parsed = plaudTokenResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      cached = null;
      throw new PlaudAuthError('plaud token refresh returned an unrecognized shape');
    }

    // Persist the rotation BEFORE caching the access token, so a crash right after can't strand
    // us on a spent refresh token.
    if (parsed.data.refresh_token && parsed.data.refresh_token !== currentRefresh) {
      await cfg.store.set(parsed.data.refresh_token);
    }

    cached = {
      token: parsed.data.access_token,
      refreshAfter: now() + parsed.data.expires_in * 1000 - EXPIRY_BUFFER_MS,
    };
    return cached.token;
  };
}
