'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { MeetingNotes } from '../../../components/meetings/MeetingNotes';
import { Tabs } from '../../../components/ui/primitives';
import { useMeeting, usePatchTask, useTasks } from '../../../lib/queries';
import { dateWIB } from '../../../lib/time';

const TABS = ['Open', 'Done', 'All'] as const;

/** Source-meeting panel for a selected task (own component so useMeeting runs conditionally). */
function TaskSource({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const { data: meeting, isLoading } = useMeeting(meetingId);

  if (isLoading) return <div className="detail-body">Loading source…</div>;
  if (!meeting) return <div className="empty">Source meeting not found.</div>;

  return (
    <>
      <div className="toolbar">
        <strong style={{ flex: 1 }}>{meeting.title}</strong>
        <button className="btn" onClick={() => router.push(`/meetings/${meeting.id}`)}>
          Open meeting
        </button>
      </div>
      <div className="detail-body">
        <h3 className="section-h">From this meeting</h3>
        {meeting.summary ? (
          <MeetingNotes markdown={meeting.summary} />
        ) : (
          <p style={{ color: 'var(--ink-3)' }}>No notes on this meeting.</p>
        )}
      </div>
    </>
  );
}

export default function ActionsPage() {
  const { data: tasks = [] } = useTasks();
  const patch = usePatchTask();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Open');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = tasks.filter((t) =>
    tab === 'All' ? true : tab === 'Open' ? t.status === 'open' : t.status === 'done',
  );
  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  return (
    <>
      <aside className="pane">
        <div className="list-header">
          <span className="list-title">Actions</span>
        </div>
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        {filtered.length === 0 ? (
          <div className="empty">No {tab.toLowerCase()} actions.</div>
        ) : (
          filtered.map((t) => (
            <div
              key={t.id}
              className="row"
              aria-selected={t.id === selectedId}
              style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center' }}
            >
              <input
                type="checkbox"
                checked={t.status === 'done'}
                aria-label={`Mark "${t.title}" done`}
                onChange={() => patch.mutate({ id: t.id, status: t.status === 'done' ? 'open' : 'done' })}
              />
              <button
                type="button"
                onClick={() => setSelectedId(t.id)}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0 }}
              >
                <div
                  className="row-primary"
                  style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}
                >
                  {t.title}
                </div>
                <div className="row-meta">
                  {t.meetingId ? 'From a meeting' : 'No linked meeting'}
                  {t.dueAt ? ` · ${dateWIB(t.dueAt)}` : ''}
                </div>
              </button>
            </div>
          ))
        )}
      </aside>

      <section className="pane detail">
        {!selected ? (
          <div className="empty">Actions come from meeting notes — select one to see its source.</div>
        ) : selected.meetingId ? (
          <TaskSource meetingId={selected.meetingId} />
        ) : (
          <div className="empty">This action isn’t linked to a meeting.</div>
        )}
      </section>
    </>
  );
}
