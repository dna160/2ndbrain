'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { Chip, Tabs } from '../../../components/ui/primitives';
import { useThreads } from '../../../lib/queries';
import { timeWIB } from '../../../lib/time';

const FILTERS = ['all', 'personal', 'bot'] as const;

export default function ConversationsLayout({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const { data: threads = [] } = useThreads(filter);
  const router = useRouter();
  const pathname = usePathname();
  const currentWaId = pathname.split('/')[2] ?? null;

  return (
    <>
      <aside className="pane">
        <div className="list-header">
          <span className="list-title">Conversations</span>
        </div>
        <Tabs tabs={FILTERS} value={filter} onChange={setFilter} />
        {threads.length === 0 ? (
          <div className="empty">
            No conversations yet. Messages to your WhatsApp number will appear here.
          </div>
        ) : (
          threads.map((t) => (
            <button
              key={t.waId}
              className="row"
              aria-selected={t.waId === currentWaId}
              onClick={() => router.push(`/conversations/${t.waId}`)}
            >
              <div className="row-primary" style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
                <span className={t.unreadCount > 0 ? 'unread' : undefined}>{t.label ?? t.profileName ?? t.waId}</span>
                {t.botActive && <Chip tone="accent">Bot active</Chip>}
              </div>
              <div className="row-meta" style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
                <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.lastMessage ?? '—'}
                </span>
                {t.lastAt && <span className="mono">{timeWIB(t.lastAt)}</span>}
                {t.unreadCount > 0 && <span className="mono">· {t.unreadCount}</span>}
              </div>
            </button>
          ))
        )}
      </aside>
      {children}
    </>
  );
}
