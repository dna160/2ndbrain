'use client';
import { useState } from 'react';

import { useToast } from '../../../components/shell/Toasts';
import { Button, Chip } from '../../../components/ui/primitives';
import { useDigest, useDigests, useResendDigest } from '../../../lib/queries';

function Section({ title, items }: { title: string; items: Array<{ text: string }> }) {
  if (items.length === 0) return null;
  return (
    <>
      <h3 className="section-h">{title}</h3>
      <ul style={{ paddingLeft: 18 }}>
        {items.map((i, k) => (
          <li key={k}>{i.text}</li>
        ))}
      </ul>
    </>
  );
}

export default function DigestsPage() {
  const { data: list = [] } = useDigests();
  const [sel, setSel] = useState<string | null>(null);
  const { data: digest } = useDigest(sel);
  const resend = useResendDigest();
  const toast = useToast();

  return (
    <>
      <aside className="pane">
        <div className="list-header">
          <span className="list-title">Digests</span>
        </div>
        {list.length === 0 ? (
          <div className="empty">No digests yet. The first arrives tonight at 21:00 WIB.</div>
        ) : (
          list.map((d) => (
            <button key={d.id} className="row" aria-selected={d.id === sel} onClick={() => setSel(d.id)}>
              <div className="row-primary mono">{d.date}</div>
              <div className="row-meta">
                <Chip tone={d.deliveredVia === 'none' ? 'warn' : undefined}>{d.deliveredVia}</Chip>
              </div>
            </button>
          ))
        )}
      </aside>

      <section className="pane detail">
        {!digest ? (
          <div className="empty">Select a digest.</div>
        ) : (
          <div className="detail-body">
            <div className="toolbar" style={{ padding: 0, border: 'none', marginBottom: 'var(--s3)' }}>
              <strong style={{ flex: 1 }} className="mono">
                {digest.date}
              </strong>
              <Button
                onClick={() =>
                  resend.mutate(digest.id, { onSuccess: (r) => toast.push(`Re-sent (${r.deliveredVia})`) })
                }
              >
                Re-send to WhatsApp
              </Button>
            </div>
            <Section title="What happened" items={digest.content.happened} />
            <Section title="My commitments" items={digest.content.commitmentsByMe} />
            <Section title="Owed to me" items={digest.content.commitmentsToMe} />
            <Section title="Conflicts" items={digest.content.conflicts} />
            {digest.content.recommendations.length > 0 && (
              <>
                <h3 className="section-h">Recommended</h3>
                {digest.content.recommendations.map((r, k) => (
                  <div key={k} style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center', padding: 'var(--s1) 0' }}>
                    <Chip tone="accent">{r.kind}</Chip>
                    <span style={{ flex: 1 }}>{r.text}</span>
                    <span className="mono row-meta">u{r.urgency}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </section>
    </>
  );
}
