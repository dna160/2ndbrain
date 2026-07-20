/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/waSend.service.ts
 * Role    : WhatsApp send with the Meta 24h customer-service window check (docs/00 F5/F8).
 *           In-window → free-form text; out-of-window → approved utility template. Pacing
 *           helper mirrors the Lynkbot broadcast rate (~80/min).
 * Exports : WaSendService, isWithinWindow, PACING_MS, sleep
 */
import { WA_WINDOW_HOURS } from '@recall/shared/constants';
import { eq } from 'drizzle-orm';

import type { Database } from '../db/client';
import { waContacts } from '../db/schema';
import type { MetaSendClient } from './meta/send.client';

export const PACING_MS = 750; // ~80 msgs/min (Lynkbot broadcast pacing)
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** True when the last inbound is within Meta's free-form window. */
export function isWithinWindow(
  lastInboundAt: Date | null,
  now: Date,
  windowHours: number = WA_WINDOW_HOURS,
): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() <= windowHours * 3600 * 1000;
}

export interface WaSendDeps {
  db: Database;
  meta: MetaSendClient;
  templateName: string;
  now?: () => Date;
}

export interface WaSendResult {
  messageId: string;
  delivery: 'sent' | 'template';
  windowOpen: boolean;
}

export class WaSendService {
  private readonly now: () => Date;

  constructor(private readonly deps: WaSendDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private async lastInboundAt(waId: string): Promise<Date | null> {
    const [contact] = await this.deps.db
      .select({ lastInboundAt: waContacts.lastInboundAt })
      .from(waContacts)
      .where(eq(waContacts.waId, waId))
      .limit(1);
    return contact?.lastInboundAt ?? null;
  }

  async send(waId: string, text: string): Promise<WaSendResult> {
    const windowOpen = isWithinWindow(await this.lastInboundAt(waId), this.now());
    if (windowOpen) {
      return { messageId: await this.deps.meta.sendText(waId, text), delivery: 'sent', windowOpen };
    }
    // Out of window — only an approved template can reopen the conversation.
    return {
      messageId: await this.deps.meta.sendTemplate(waId, this.deps.templateName),
      delivery: 'template',
      windowOpen,
    };
  }
}
