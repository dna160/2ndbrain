'use client';
import { useState } from 'react';

import { useToast } from '../../../components/shell/Toasts';
import { Button, Chip, Well } from '../../../components/ui/primitives';
import { useKeyMap } from '../../../lib/keyboard';
import { useResolveDraft, useUpcoming } from '../../../lib/queries';
import { dateWIB, timeWIB } from '../../../lib/time';

export default function UpcomingPage() {
  const { data } = useUpcoming();
  const resolve = useResolveDraft();
  const toast = useToast();
  const events = data?.events ?? [];
  const drafts = data?.drafts ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const selectedDraft = drafts.find((d) => d.id === sel) ?? null;

  const act = (id: string, decision: 'confirm' | 'reject') =>
    resolve.mutate(
      { id, decision },
      { onSuccess: () => toast.push(decision === 'confirm' ? 'Added to Google Calendar.' : 'Draft rejected') },
    );

  useKeyMap(
    {
      c: () => selectedDraft && act(selectedDraft.id, 'confirm'),
      x: () => selectedDraft && act(selectedDraft.id, 'reject'),
    },
    [selectedDraft],
  );

  return (
    <>
      <aside className="pane">
        <div className="list-header">
          <span className="list-title">Upcoming</span>
        </div>
        {drafts.map((d) => (
          <button
            key={d.id}
            className="row"
            aria-selected={d.id === sel}
            onClick={() => setSel(d.id)}
          >
            <div className="row-primary" style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
              {(d.payload as { summary?: string }).summary ?? d.action} <Chip tone="warn">Proposed</Chip>
            </div>
            <div className="row-meta">
              {d.sourceType} draft · {d.action}
            </div>
          </button>
        ))}
        {events.length === 0 && drafts.length === 0 ? (
          <div className="empty">No upcoming events. Connect Google Calendar in Settings.</div>
        ) : (
          events.map((e) => (
            <div
              key={e.id}
              className="row"
              style={e.conflictWith ? { borderLeft: '2px solid var(--warn)' } : undefined}
            >
              <div className="row-primary">{e.title ?? '(untitled)'}</div>
              <div className="row-meta">
                <span className="mono">
                  {dateWIB(e.startAt)} {timeWIB(e.startAt)}
                </span>{' '}
                · {e.attendeeCount} attendees
                {e.conflictWith && (
                  <span style={{ color: 'var(--warn)' }}> · overlaps with {e.conflictWith}</span>
                )}
              </div>
            </div>
          ))
        )}
      </aside>

      <section className="pane detail">
        {!selectedDraft ? (
          <div className="empty">Select a draft to confirm or reject.</div>
        ) : (
          <div className="detail-body">
            <h3 className="section-h">Proposed {selectedDraft.action}</h3>
            <Well>{JSON.stringify(selectedDraft.payload, null, 2)}</Well>
            <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 'var(--s4)' }}>
              <Button variant="accent" onClick={() => act(selectedDraft.id, 'confirm')}>
                Confirm draft
              </Button>
              <Button onClick={() => act(selectedDraft.id, 'reject')}>Reject</Button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
