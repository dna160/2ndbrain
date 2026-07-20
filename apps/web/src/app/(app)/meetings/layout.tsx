'use client';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { StatusDot } from '../../../components/ui/primitives';
import { useKeyMap } from '../../../lib/keyboard';
import { useMeetings } from '../../../lib/queries';
import { dateWIB } from '../../../lib/time';

export default function MeetingsLayout({ children }: { children: ReactNode }) {
  const { data: meetings = [] } = useMeetings();
  const router = useRouter();
  const pathname = usePathname();
  const currentId = pathname.split('/')[2] ?? null;
  const idx = Math.max(
    0,
    meetings.findIndex((m) => m.id === currentId),
  );

  useKeyMap(
    {
      j: () => {
        const next = meetings[Math.min(idx + 1, meetings.length - 1)];
        if (next) router.push(`/meetings/${next.id}`);
      },
      k: () => {
        const prev = meetings[Math.max(idx - 1, 0)];
        if (prev) router.push(`/meetings/${prev.id}`);
      },
    },
    [meetings, idx],
  );

  return (
    <>
      <aside className="pane">
        <div className="list-header">
          <span className="list-title">Meetings</span>
        </div>
        {meetings.length === 0 ? (
          <div className="empty">
            No meetings yet. Forward a voice note to your Recall number or upload audio.
          </div>
        ) : (
          meetings.map((m) => (
            <button
              key={m.id}
              className="row"
              aria-selected={m.id === currentId}
              onClick={() => router.push(`/meetings/${m.id}`)}
            >
              <div className="row-primary">{m.title}</div>
              <div className="row-meta" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
                <span className="mono">{dateWIB(m.occurredAt)}</span>
                <span>· {m.participantCount} speakers</span>
                <StatusDot
                  status={(m.attributionConfidence ?? 0) >= 0.7 ? 'ok' : 'warn'}
                  title="attribution confidence"
                />
              </div>
            </button>
          ))
        )}
      </aside>
      {children}
    </>
  );
}
