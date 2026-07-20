'use client';
import { useState } from 'react';

import { useToast } from '../../../components/shell/Toasts';
import { Button, StatusDot, Well } from '../../../components/ui/primitives';
import { usePipelineRuns, useQueueDepths, useRetryRun } from '../../../lib/queries';
import { idrFormat, timeWIB } from '../../../lib/time';

function statusDot(s: string): string {
  return s === 'done' ? 'ok' : s === 'failed' || s === 'dead' ? 'err' : 'running';
}

export default function PipelinePage() {
  const { data: runs = [] } = usePipelineRuns();
  const { data: queues = [] } = useQueueDepths();
  const retry = useRetryRun();
  const toast = useToast();
  const [sel, setSel] = useState<string | null>(null);
  const run = runs.find((r) => r.id === sel) ?? null;

  return (
    <>
      <aside className="pane">
        <div className="list-header">
          <span className="list-title">Pipeline</span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 'var(--s2)',
            padding: 'var(--s2) var(--s4)',
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--border)',
          }}
          aria-live="polite"
        >
          {queues.map((q) => (
            <span key={q.queue} className="chip" title="waiting / active / failed">
              <span>{q.queue.replace('recall-', '')}</span>
              <span className="mono">
                {q.waiting}/{q.active}/{q.failed}
              </span>
            </span>
          ))}
        </div>
        {runs.length === 0 ? (
          <div className="empty">No pipeline runs yet.</div>
        ) : (
          runs.map((r) => (
            <button key={r.id} className="row" aria-selected={r.id === sel} onClick={() => setSel(r.id)}>
              <div className="row-primary" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
                <StatusDot status={statusDot(r.status)} title={r.status} /> {r.jobType}
              </div>
              <div className="row-meta">
                <span className="mono">{timeWIB(r.createdAt)}</span> ·{' '}
                <span className="mono">{idrFormat(r.costIdr)}</span>
              </div>
            </button>
          ))
        )}
      </aside>

      <section className="pane detail">
        {!run ? (
          <div className="empty">Select a run to see its stage timeline.</div>
        ) : (
          <div className="detail-body">
            <div className="toolbar">
              <strong style={{ flex: 1 }}>{run.jobType}</strong>
              {(run.status === 'failed' || run.status === 'dead') && (
                <Button
                  variant="accent"
                  onClick={() => retry.mutate(run.id, { onSuccess: () => toast.push('Run re-enqueued') })}
                >
                  Retry run
                </Button>
              )}
            </div>
            <h3 className="section-h">Stages</h3>
            {run.stages.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center', padding: 'var(--s1) 0' }}>
                <StatusDot status={s.ok ? 'ok' : 'err'} />
                <span style={{ flex: 1 }}>{s.stage}</span>
                <span className="mono" style={{ color: 'var(--ink-3)' }}>
                  {s.ms}ms
                </span>
              </div>
            ))}
            {run.stages.some((s) => !s.ok) && (
              <>
                <h3 className="section-h">Error</h3>
                <Well>{run.stages.find((s) => !s.ok)?.err ?? 'unknown error'}</Well>
              </>
            )}
            <h3 className="section-h">Cost</h3>
            <p className="mono">
              {idrFormat(run.costIdr)} · {run.attempts} attempts
            </p>
          </div>
        )}
      </section>
    </>
  );
}
