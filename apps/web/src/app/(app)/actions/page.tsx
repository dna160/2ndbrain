'use client';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { MeetingNotes } from '../../../components/meetings/MeetingNotes';
import { useMeeting, useMeetings, usePatchTask, useTasks } from '../../../lib/queries';
import type { TaskListItem } from '@recall/shared';

const OTHER = '__other__';

interface Group {
  key: string;
  meetingId: string | null;
  title: string;
  tasks: TaskListItem[];
  open: number;
  done: number;
}

/** Native checkbox with an indeterminate (partially-done) state. */
function TriCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={label}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** Source-meeting panel for the selected group (own component so useMeeting runs conditionally). */
function MeetingSource({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const { data: meeting, isLoading } = useMeeting(meetingId);
  if (isLoading) return <div className="detail-body">Loading meeting…</div>;
  if (!meeting) return <div className="empty">Meeting not found.</div>;
  return (
    <>
      <div className="toolbar">
        <strong style={{ flex: 1 }}>{meeting.title}</strong>
        <button className="btn" onClick={() => router.push(`/meetings/${meeting.id}`)}>
          Open meeting
        </button>
      </div>
      <div className="detail-body">
        <h3 className="section-h">Meeting notes</h3>
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
  const { data: meetings = [] } = useMeetings();
  const patch = usePatchTask();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  const groups = useMemo<Group[]>(() => {
    const titleById = new Map(meetings.map((m) => [m.id, m.title]));
    const byKey = new Map<string, TaskListItem[]>();
    for (const t of tasks) {
      const key = t.meetingId ?? OTHER;
      const arr = byKey.get(key) ?? [];
      arr.push(t);
      byKey.set(key, arr);
    }
    return [...byKey.entries()]
      .map(([key, ts]) => {
        const open = ts.filter((t) => t.status === 'open').length;
        return {
          key,
          meetingId: key === OTHER ? null : key,
          title: key === OTHER ? 'Other actions' : titleById.get(key) ?? 'Untitled meeting',
          tasks: ts,
          open,
          done: ts.length - open,
        };
      })
      // Groups with open actions first, then alphabetical.
      .sort((a, b) => (b.open > 0 ? 1 : 0) - (a.open > 0 ? 1 : 0) || a.title.localeCompare(b.title));
  }, [tasks, meetings]);

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Clear a whole meeting: any open → mark all done; all done → reopen all.
  const bulkToggle = (g: Group) => {
    const target = g.open > 0 ? 'done' : 'open';
    for (const t of g.tasks) {
      if ((target === 'done' && t.status === 'open') || (target === 'open' && t.status === 'done')) {
        patch.mutate({ id: t.id, status: target });
      }
    }
  };

  return (
    <>
      <aside className="pane">
        <div className="list-header">
          <span className="list-title">Actions</span>
          <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 'var(--text-xs)' }}>
            {groups.reduce((n, g) => n + g.open, 0)} open
          </span>
        </div>

        {groups.length === 0 ? (
          <div className="empty">No actions yet. They appear here from your meeting notes.</div>
        ) : (
          groups.map((g) => {
            const isOpen = expanded.has(g.key);
            return (
              <div key={g.key} className="mgroup">
                <div
                  className="mgroup-head"
                  aria-selected={g.meetingId != null && g.meetingId === selectedMeetingId}
                  onClick={() => {
                    toggleExpand(g.key);
                    setSelectedMeetingId(g.meetingId);
                  }}
                >
                  <TriCheckbox
                    checked={g.open === 0}
                    indeterminate={g.open > 0 && g.done > 0}
                    onChange={() => bulkToggle(g)}
                    label={`Clear all actions for ${g.title}`}
                  />
                  {isOpen ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
                  <span className="mgroup-title" style={{ textDecoration: g.open === 0 ? 'line-through' : undefined }}>
                    {g.title}
                  </span>
                  <span className="mgroup-count">{g.open === 0 ? 'done' : `${g.open} open`}</span>
                </div>

                {isOpen &&
                  g.tasks.map((t) => (
                    <div key={t.id} className="action-item">
                      <input
                        type="checkbox"
                        checked={t.status === 'done'}
                        aria-label={`Mark "${t.title}" done`}
                        onChange={() => patch.mutate({ id: t.id, status: t.status === 'done' ? 'open' : 'done' })}
                      />
                      <span style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}>
                        {t.title}
                      </span>
                    </div>
                  ))}
              </div>
            );
          })
        )}
      </aside>

      <section className="pane detail">
        {selectedMeetingId ? (
          <MeetingSource meetingId={selectedMeetingId} />
        ) : (
          <div className="empty">Select a meeting to see its notes. Check it off to clear its actions.</div>
        )}
      </section>
    </>
  );
}
