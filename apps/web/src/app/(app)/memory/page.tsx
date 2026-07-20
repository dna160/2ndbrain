'use client';
import { useState } from 'react';

import { useToast } from '../../../components/shell/Toasts';
import { Button, Chip, Tabs } from '../../../components/ui/primitives';
import { useKeyMap } from '../../../lib/keyboard';
import { useGraph, useMemories, useResolveReview, useReviews } from '../../../lib/queries';

const TABS = ['Review', 'Memories', 'Graph'] as const;

export default function MemoryPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Review');
  const { data: reviews = [] } = useReviews();
  const { data: memories = [] } = useMemories('');
  const { data: graph } = useGraph();
  const resolve = useResolveReview();
  const toast = useToast();
  const [sel, setSel] = useState(0);

  const current = reviews[sel];
  const act = (resolution: 'approved' | 'rejected') => {
    if (!current) return;
    resolve.mutate(
      { id: current.id, resolution },
      { onSuccess: () => toast.push(resolution === 'approved' ? 'Memory approved' : 'Memory rejected') },
    );
    setSel(0);
  };
  useKeyMap({ c: () => act('approved'), x: () => act('rejected') }, [current]);

  return (
    <>
      <aside className="pane">
        <div className="list-header">
          <span className="list-title">Memory</span>
        </div>
        <Tabs tabs={TABS} value={tab} onChange={setTab} />

        {tab === 'Review' &&
          (reviews.length === 0 ? (
            <div className="empty">Review queue is clear.</div>
          ) : (
            reviews.map((r, i) => (
              <button key={r.id} className="row" aria-selected={i === sel} onClick={() => setSel(i)}>
                <div className="row-primary">{r.memoryContent}</div>
                <div className="row-meta">
                  <Chip tone={r.reason === 'contradiction' ? 'warn' : undefined}>{r.reason}</Chip>
                </div>
              </button>
            ))
          ))}

        {tab === 'Memories' &&
          (memories.length === 0 ? (
            <div className="empty">No memories yet. They accrue from nightly consolidation.</div>
          ) : (
            memories.map((m) => (
              <div key={m.id} className="row">
                <div className="row-primary">{m.content}</div>
                <div className="row-meta mono">
                  conf {m.confidence.toFixed(2)} · {m.provenanceEventIds.length} sources
                  {m.sensitivity === 'sensitive' && ' · sensitive'}
                </div>
              </div>
            ))
          ))}

        {tab === 'Graph' && <div className="empty">Open the Graph pane →</div>}
      </aside>

      <section className="pane detail">
        {tab === 'Review' && current ? (
          <div className="detail-body">
            <h3 className="section-h">{current.reason.replace('_', ' ')}</h3>
            <p>{current.memoryContent}</p>
            <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 'var(--s4)' }}>
              <Button variant="accent" onClick={() => act('approved')}>
                Approve (c)
              </Button>
              <Button onClick={() => act('rejected')}>Reject (x)</Button>
            </div>
          </div>
        ) : tab === 'Graph' ? (
          <GraphCanvas graph={graph ?? { nodes: [], edges: [] }} />
        ) : (
          <div className="empty">Select an item.</div>
        )}
      </section>
    </>
  );
}

// Lean SVG graph (node size = salience). Force-directed d3 layout is a later polish pass.
function GraphCanvas({ graph }: { graph: { nodes: Array<{ id: string; name: string; salience: number }>; edges: Array<{ fromId: string; toId: string }> } }) {
  if (graph.nodes.length === 0) return <div className="empty">No entities yet.</div>;
  const W = 600;
  const H = 400;
  const pos = new Map(
    graph.nodes.map((n, i) => {
      const angle = (i / graph.nodes.length) * Math.PI * 2;
      return [n.id, { x: W / 2 + Math.cos(angle) * 160, y: H / 2 + Math.sin(angle) * 140 }] as const;
    }),
  );
  return (
    <div className="detail-body">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Entity graph">
        {graph.edges.map((e, i) => {
          const a = pos.get(e.fromId);
          const b = pos.get(e.toId);
          if (!a || !b) return null;
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--border)" />;
        })}
        {graph.nodes.map((n) => {
          const p = pos.get(n.id)!;
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={6 + n.salience * 10} fill="var(--accent-weak)" stroke="var(--accent)" />
              <text x={p.x} y={p.y - 12} fontSize={11} textAnchor="middle" fill="var(--ink-2)">
                {n.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
