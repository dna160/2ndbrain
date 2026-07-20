/**
 * Production adapters wiring the auth core to Clerk (JWT verification) and the users table
 * (tenant resolution). Kept apart from authenticator.ts so the core stays pure/testable.
 */
import { verifyToken } from '@clerk/backend';
import { eq } from 'drizzle-orm';

import type { AuthenticatorDeps, TenantResolution } from './authenticator';
import type { Database } from '../db/client';
import { users } from '../db/schema';

export function clerkVerify(secretKey: string): AuthenticatorDeps['verify'] {
  return async (token: string) => {
    try {
      const payload = await verifyToken(token, { secretKey });
      return payload.sub ? { sub: payload.sub } : null;
    } catch {
      return null;
    }
  };
}

export function resolveTenantFromDb(db: Database): AuthenticatorDeps['resolveTenant'] {
  return async (clerkUserId: string): Promise<TenantResolution | null> => {
    const rows = await db
      .select({ userId: users.id, tenantId: users.tenantId })
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1);
    return rows[0] ?? null;
  };
}
