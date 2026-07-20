'use client';
import { useState } from 'react';

import { Tabs } from '../../../components/ui/primitives';
import { usePatchTask, useTasks } from '../../../lib/queries';
import { dateWIB } from '../../../lib/time';

const TABS = ['Open', 'Done', 'All'] as const;

export default function ActionsPage() {
  const { data: tasks = [] } = useTasks();
  const patch = usePatchTask();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Open');
  const filtered = tasks.filter((t) =>
    tab === 'All' ? true : tab === 'Open' ? t.status === 'open' : t.status === 'done',
  );

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
            <div key={t.id} className="row" style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={t.status === 'done'}
                aria-label={`Mark "${t.title}" done`}
                onChange={() => patch.mutate({ id: t.id, status: t.status === 'done' ? 'open' : 'done' })}
              />
              <div style={{ flex: 1 }}>
                <div
                  className="row-primary"
                  style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}
                >
                  {t.title}
                </div>
                {t.dueAt && <div className="row-meta mono">{dateWIB(t.dueAt)}</div>}
              </div>
            </div>
          ))
        )}
      </aside>
      <section className="pane detail">
        <div className="empty">Actions come from meeting notes — open one to see its source.</div>
      </section>
    </>
  );
}
