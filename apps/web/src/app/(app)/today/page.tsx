'use client';
import { CalendarClock, ListChecks, Mic, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { useEvents, useMeetings, useTasks, useUpcoming } from '../../../lib/queries';
import { dayKeyWIB, relativeWIB, timeWIB } from '../../../lib/time';

/** Collapse a possibly-markdown/multi-line body to a clean one-line snippet. */
function snippet(text: string | null, max = 90): string {
  if (!text) return '';
  const flat = text.replace(/[#>*_`-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export default function TodayPage() {
  const router = useRouter();
  const { data: events = [] } = useEvents();
  const { data: meetings = [] } = useMeetings();
  const { data: tasks = [] } = useTasks();
  const { data: upcomingData } = useUpcoming();
  const upcoming = upcomingData?.events ?? [];

  const today = dayKeyWIB();
  const now = new Date();

  const todaysMeetings = useMemo(
    () => meetings.filter((m) => dayKeyWIB(m.occurredAt) === today),
    [meetings, today],
  );
  // Messages = WhatsApp events today. Plaud imports (the big note blobs) are shown as meetings.
  const todaysMessages = useMemo(
    () => events.filter((e) => e.source === 'wa' && dayKeyWIB(e.occurredAt) === today),
    [events, today],
  );
  const openTasks = useMemo(() => tasks.filter((t) => t.status === 'open'), [tasks]);
  const nextUp = useMemo(
    () =>
      upcoming
        .filter((e) => new Date(e.startAt).getTime() > now.getTime())
        .sort((a, b) => a.startAt.localeCompare(b.startAt))[0],
    [upcoming, now],
  );

  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(now);

  return (
    <>
      <aside className="pane">
        <div className="list-header">
          <span className="list-title">Today</span>
          <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 'var(--text-xs)' }}>
            {dateLabel}
          </span>
        </div>

        {todaysMeetings.length === 0 && todaysMessages.length === 0 ? (
          <div className="empty">Nothing captured today yet.</div>
        ) : (
          <>
            {todaysMeetings.length > 0 && (
              <>
                <div className="group-h">
                  <Mic size={13} aria-hidden /> Meetings
                </div>
                {todaysMeetings.map((m) => (
                  <button key={m.id} className="row row-btn" onClick={() => router.push(`/meetings/${m.id}`)}>
                    <div className="row-primary">{m.title}</div>
                    <div className="row-meta">
                      <span className="mono">{timeWIB(m.occurredAt)}</span> · {m.participantCount}{' '}
                      {m.participantCount === 1 ? 'speaker' : 'speakers'}
                    </div>
                  </button>
                ))}
              </>
            )}

            {todaysMessages.length > 0 && (
              <>
                <div className="group-h">
                  <MessageSquare size={13} aria-hidden /> Messages
                </div>
                {todaysMessages.map((e) => (
                  <div key={e.id} className="row">
                    <div className="row-primary">{snippet(e.content) || `${e.type} message`}</div>
                    <div className="row-meta">
                      <span className="mono">{timeWIB(e.occurredAt)}</span>
                      {e.senderWaId ? ` · ${e.senderWaId}` : ''}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </aside>

      <section className="pane detail">
        <div className="detail-body">
          <div className="glance-stats">
            <div className="stat">
              <Mic size={16} aria-hidden />
              <span className="stat-n">{todaysMeetings.length}</span>
              <span className="stat-l">meetings</span>
            </div>
            <div className="stat">
              <ListChecks size={16} aria-hidden />
              <span className="stat-n">{openTasks.length}</span>
              <span className="stat-l">open actions</span>
            </div>
            <div className="stat">
              <MessageSquare size={16} aria-hidden />
              <span className="stat-n">{todaysMessages.length}</span>
              <span className="stat-l">messages</span>
            </div>
          </div>

          <h3 className="section-h">
            <CalendarClock size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Next up
          </h3>
          {nextUp ? (
            <div className="glance-card">
              <div style={{ fontWeight: 600 }}>{nextUp.title ?? 'Untitled event'}</div>
              <div className="row-meta" style={{ marginTop: 2 }}>
                <span className="mono">{timeWIB(nextUp.startAt)}</span> · {relativeWIB(nextUp.startAt, now)} ·{' '}
                {nextUp.attendeeCount} {nextUp.attendeeCount === 1 ? 'attendee' : 'attendees'}
              </div>
              {nextUp.conflictWith && (
                <div className="chip chip-warn" style={{ marginTop: 6 }}>
                  Conflicts with {nextUp.conflictWith}
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: 'var(--ink-3)' }}>Nothing scheduled ahead.</p>
          )}

          <h3 className="section-h">
            <ListChecks size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Open actions
          </h3>
          {openTasks.length === 0 ? (
            <p style={{ color: 'var(--ink-3)' }}>No open actions. Nice.</p>
          ) : (
            <ul className="glance-actions">
              {openTasks.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <span>{t.title}</span>
                  {t.dueAt && <span className="mono row-meta">{timeWIB(t.dueAt)}</span>}
                </li>
              ))}
              {openTasks.length > 6 && <li style={{ color: 'var(--ink-3)' }}>+{openTasks.length - 6} more</li>}
            </ul>
          )}

          <p className="glance-digest">Tonight’s digest generates at 21:00 WIB.</p>
        </div>
      </section>
    </>
  );
}
