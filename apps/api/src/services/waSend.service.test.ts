import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/client';
import type { MetaSendClient } from './meta/send.client';
import { isWithinWindow, sleep, WaSendService } from './waSend.service';

const now = new Date(1_700_000_000_000);

function db(lastInboundAt: Date | null): Database {
  const make = (result: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit']) q[m] = () => q;
    q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  };
  return { select: () => make([{ lastInboundAt }]) } as unknown as Database;
}

function meta(): MetaSendClient & { sendText: ReturnType<typeof vi.fn>; sendTemplate: ReturnType<typeof vi.fn> } {
  return {
    sendText: vi.fn(async () => 'wamid.text'),
    sendTemplate: vi.fn(async () => 'wamid.template'),
  };
}

describe('isWithinWindow', () => {
  it('is false with no prior inbound', () => {
    expect(isWithinWindow(null, now)).toBe(false);
  });
  it('is true within 24h', () => {
    expect(isWithinWindow(new Date(now.getTime() - 1000), now)).toBe(true);
  });
  it('is false past 24h', () => {
    expect(isWithinWindow(new Date(now.getTime() - 25 * 3600 * 1000), now)).toBe(false);
  });
  it('sleep resolves (pacing helper)', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});

describe('WaSendService.send', () => {
  it('sends free-form text when the window is open', async () => {
    const m = meta();
    const svc = new WaSendService({ db: db(new Date(now.getTime() - 1000)), meta: m, templateName: 'tpl', now: () => now });
    const result = await svc.send('628a', 'hai');
    expect(result).toMatchObject({ delivery: 'sent', windowOpen: true, messageId: 'wamid.text' });
    expect(m.sendText).toHaveBeenCalledWith('628a', 'hai');
    expect(m.sendTemplate).not.toHaveBeenCalled();
  });

  it('falls back to an approved template when the window is closed', async () => {
    const m = meta();
    const svc = new WaSendService({ db: db(null), meta: m, templateName: 'daily_brief_ready', now: () => now });
    const result = await svc.send('628a', 'hai');
    expect(result).toMatchObject({ delivery: 'template', windowOpen: false });
    expect(m.sendTemplate).toHaveBeenCalledWith('628a', 'daily_brief_ready');
    expect(m.sendText).not.toHaveBeenCalled();
  });

  it('works with the default system clock', async () => {
    const m = meta();
    const svc = new WaSendService({ db: db(null), meta: m, templateName: 'tpl' });
    await svc.send('628a', 'hi');
    expect(m.sendTemplate).toHaveBeenCalledOnce();
  });
});
