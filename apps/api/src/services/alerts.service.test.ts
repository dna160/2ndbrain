import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/client';
import { AlertsService } from './alerts.service';

function db(n: number): Database {
  const make = (result: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['from', 'where']) q[m] = () => q;
    q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  };
  return { select: () => make([{ n }]) } as unknown as Database;
}

describe('AlertsService.checkDlq', () => {
  it('sends a WhatsApp alert when the DLQ is non-empty', async () => {
    const send = vi.fn(async () => ({ messageId: 'm', delivery: 'sent' as const, windowOpen: true }));
    const result = await new AlertsService({ db: db(3), waSend: { send }, operatorWaId: '628op' }).checkDlq('t1');
    expect(result).toEqual({ count: 3, alerted: true });
    expect(send).toHaveBeenCalledWith('628op', expect.stringContaining('dead-letter'));
  });

  it('stays silent when the DLQ is empty', async () => {
    const send = vi.fn();
    const result = await new AlertsService({ db: db(0), waSend: { send }, operatorWaId: '628op' }).checkDlq('t1');
    expect(result).toEqual({ count: 0, alerted: false });
    expect(send).not.toHaveBeenCalled();
  });
});
