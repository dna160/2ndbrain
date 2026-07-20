/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/lynkbot.client.ts
 * Role    : Proxy to Lynkbot's internal takeover endpoint (docs/01 §3.3 PR part 2) —
 *           pause/resume the commerce bot for a waId. Guarded by the internal API key.
 */
export interface TakeoverClient {
  pause(waId: string, untilISO: string): Promise<void>;
  resume(waId: string): Promise<void>;
}

export class LynkbotTakeoverClient implements TakeoverClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalApiKey: string,
  ) {}

  private headers(): Record<string, string> {
    return { 'x-internal-api-key': this.internalApiKey, 'content-type': 'application/json' };
  }

  async pause(waId: string, untilISO: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/internal/brain/takeover`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ waId, untilISO }),
    });
    if (!res.ok) throw new Error(`takeover pause failed: ${res.status}`);
  }

  async resume(waId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/internal/brain/takeover`, {
      method: 'DELETE',
      headers: this.headers(),
      body: JSON.stringify({ waId }),
    });
    if (!res.ok) throw new Error(`takeover resume failed: ${res.status}`);
  }
}
