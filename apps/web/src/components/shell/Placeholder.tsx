export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <aside className="pane">
        <div className="list-header">
          <span className="list-title">{title}</span>
        </div>
        <div className="empty">Coming in a later phase.</div>
      </aside>
      <section className="pane detail" />
    </>
  );
}
