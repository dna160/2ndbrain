'use client';
/**
 * The signature element (docs/02 §1). Horizontal time bar; topics render as labeled blocks;
 * hover previews subnotes; click scrolls the transcript + flashes the segment. `[`/`]` move
 * between topics (wired by the parent via currentIndex).
 */
import { useState } from 'react';

import type { StructuringTopic } from '@recall/shared';
import { topicSpan } from '../../lib/scrubber';

export function TopicScrubber({
  topics,
  totalMs,
  currentIndex,
  onSelect,
}: {
  topics: StructuringTopic[];
  totalMs: number;
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="scrubber" role="group" aria-label="Topic timeline">
      {topics.map((t, i) => {
        const { leftPct, widthPct } = topicSpan(t.startMs, t.endMs, totalMs);
        return (
          <button
            key={i}
            className="scrubber-topic"
            aria-current={i === currentIndex}
            aria-label={`Topic: ${t.title}`}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            onFocus={() => setHover(i)}
            onClick={() => onSelect(i)}
          >
            {t.title}
          </button>
        );
      })}
      {hover !== null && topics[hover] && (
        <div className="scrubber-preview" style={{ left: `${topicSpan(topics[hover]!.startMs, topics[hover]!.endMs, totalMs).leftPct}%` }}>
          <strong>{topics[hover]!.title}</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 14 }}>
            {topics[hover]!.subnotes.slice(0, 3).map((s, k) => (
              <li key={k}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
