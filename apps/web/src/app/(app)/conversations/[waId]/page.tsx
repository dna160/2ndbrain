'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { useToast } from '../../../../components/shell/Toasts';
import { Chip, ConfirmBar } from '../../../../components/ui/primitives';
import { useKeyMap } from '../../../../lib/keyboard';
import { useSendReply, useThreadMessages } from '../../../../lib/queries';
import { timeWIB } from '../../../../lib/time';

export default function ThreadPage() {
  const { waId } = useParams<{ waId: string }>();
  const { data: messages = [] } = useThreadMessages(waId);
  const send = useSendReply(waId);
  const toast = useToast();
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState(false);

  const doSend = (takeover = false) => {
    if (!text.trim()) return;
    send.mutate(
      { text, takeover },
      {
        onSuccess: (r) => {
          if (r.needsConfirm) setConfirm(true);
          else {
            setText('');
            setConfirm(false);
            toast.push(`Sent (${r.delivery})`);
          }
        },
      },
    );
  };

  useKeyMap(
    { r: () => document.querySelector<HTMLTextAreaElement>('textarea[data-reply]')?.focus() },
    [waId],
  );

  const ordered = [...messages].reverse();

  return (
    <section className="pane detail">
      <div className="toolbar">
        <strong style={{ flex: 1 }} className="mono">
          {waId}
        </strong>
      </div>
      <div className="detail-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
        {ordered.map((m) => (
          <div key={m.id} style={{ alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start', maxWidth: '72%' }}>
            <div
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: 'var(--s2) var(--s3)',
              }}
            >
              {m.origin === 'lynkbot_bot' && <Chip tone="accent">Assistant</Chip>}
              <div>{m.content ?? `[${m.type}]`}</div>
              <div className="row-meta mono">{timeWIB(m.occurredAt)}</div>
            </div>
          </div>
        ))}
      </div>

      {confirm && (
        <div style={{ padding: '0 var(--s5) var(--s3)' }}>
          <ConfirmBar
            message="Replying pauses the assistant for this chat for 24h."
            confirmLabel="Continue"
            onConfirm={() => doSend(true)}
            onCancel={() => setConfirm(false)}
          />
        </div>
      )}

      <div
        style={{
          padding: 'var(--s3) var(--s5)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 'var(--s2)',
        }}
      >
        <textarea
          data-reply
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Reply…  (⌘⏎ to send)"
          rows={1}
          style={{ flex: 1, resize: 'none', padding: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', font: 'inherit' }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              doSend(false);
            }
          }}
        />
        <button className="btn btn-accent" onClick={() => doSend(false)}>
          Send
        </button>
      </div>
    </section>
  );
}
