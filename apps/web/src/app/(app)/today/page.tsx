'use client';
import { useEvents } from '../../../lib/queries';
import { timeWIB } from '../../../lib/time';

export default function TodayPage() {
  const { data: events = [] } = useEvents();
  const today = new Date().toISOString().slice(0, 10);
  const todays = events.filter((e) => e.occurredAt.slice(0, 10) === today);

  return (
    <>
      <aside className="pane">
        <div className="list-header">
          <span className="list-title">Today</span>
        </div>
        {todays.length === 0 ? (
          <div className="empty">Nothing captured today yet.</div>
        ) : (
          todays.map((e) => (
            <div key={e.id} className="row">
              <div className="row-primary">
                {e.content ?? `${e.type} from ${e.senderWaId ?? 'system'}`}
              </div>
              <div className="row-meta">
                <span className="mono">{timeWIB(e.occurredAt)}</span> · {e.source}/{e.type}
              </div>
            </div>
          ))
        )}
      </aside>
      <section className="pane detail">
        <div className="empty">Tonight’s digest generates at 21:00 WIB.</div>
      </section>
    </>
  );
}
