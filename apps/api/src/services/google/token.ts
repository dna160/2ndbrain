/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/google/token.ts
 * Role    : Resolve the operator's Google OAuth access token from Clerk (tokens live in Clerk;
 *           we store only metadata). Used by the Google Calendar client.
 */
import { createClerkClient } from '@clerk/backend';

export function googleTokenProvider(
  secretKey: string,
  resolveClerkUserId: () => Promise<string | null>,
): () => Promise<string> {
  const clerk = createClerkClient({ secretKey });
  return async () => {
    const userId = await resolveClerkUserId();
    if (!userId) throw new Error('google token: no operator user resolved');
    const response = await clerk.users.getUserOauthAccessToken(userId, 'oauth_google');
    const token = response.data[0]?.token;
    if (!token) throw new Error('google token: operator has no connected Google account');
    return token;
  };
}
