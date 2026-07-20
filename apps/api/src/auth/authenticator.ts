/**
 * Authentication core (docs/01 §7) — pure and dependency-injected so every branch is unit
 * testable without a live Clerk or DB. Resolves a bearer token → { clerkUserId, userId,
 * tenantId }, caching the tenant resolution for 5 minutes.
 */
export interface AuthContext {
  clerkUserId: string;
  userId: string;
  tenantId: string;
}

export interface TenantResolution {
  userId: string;
  tenantId: string;
}

export class AuthError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthenticatorDeps {
  /** Verify a JWT; return its claims (with `sub`) or null when invalid/expired. */
  verify: (token: string) => Promise<{ sub: string } | null>;
  /** Map a Clerk user id to its tenant; null when the user is not provisioned. */
  resolveTenant: (clerkUserId: string) => Promise<TenantResolution | null>;
  cacheTtlMs?: number;
  now?: () => number;
}

export function extractBearer(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export type Authenticate = (authorization: string | undefined) => Promise<AuthContext>;

export function createAuthenticator(deps: AuthenticatorDeps): Authenticate {
  const ttl = deps.cacheTtlMs ?? 5 * 60 * 1000;
  const now = deps.now ?? (() => Date.now());
  const cache = new Map<string, { value: TenantResolution; expiresAt: number }>();

  return async function authenticate(authorization: string | undefined): Promise<AuthContext> {
    const token = extractBearer(authorization);
    if (!token) throw new AuthError(401, 'missing bearer token');

    const claims = await deps.verify(token);
    if (!claims?.sub) throw new AuthError(401, 'invalid or expired token');
    const clerkUserId = claims.sub;

    const cached = cache.get(clerkUserId);
    if (cached && cached.expiresAt > now()) {
      return { clerkUserId, userId: cached.value.userId, tenantId: cached.value.tenantId };
    }

    const resolved = await deps.resolveTenant(clerkUserId);
    if (!resolved) throw new AuthError(403, 'user not provisioned in any tenant');
    cache.set(clerkUserId, { value: resolved, expiresAt: now() + ttl });
    return { clerkUserId, userId: resolved.userId, tenantId: resolved.tenantId };
  };
}
