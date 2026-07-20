'use client';
import type { TranscriptSegmentDto } from '@recall/shared';
import { useEffect, useRef, useState } from 'react';

import { msToClock } from '../../lib/time';

export function TranscriptViewer({
  segments,
  seekMs,
}: {
  segments: TranscriptSegmentDto[];
  seekMs: number | null;
}) {
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);

  useEffect(() => {
    if (seekMs == null) return;
    let target = segments.findIndex((s) => seekMs >= s.startMs && seekMs < s.endMs);
    if (target < 0) target = segments.findIndex((s) => s.startMs >= seekMs);
    if (target < 0) return;
    refs.current[target]?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    setFlashIdx(target);
    const timer = setTimeout(() => setFlashIdx(null), 1000);
    return () => clearTimeout(timer);
  }, [seekMs, segments]);

  return (
    <div>
      {segments.map((s, i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={`segment${flashIdx === i ? ' flash' : ''}`}
        >
          <span className="seg-time">{msToClock(s.startMs)}</span>
          <span>
            <span className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginRight: 6 }}>
              {s.speakerKey}
            </span>
            {s.text}
          </span>
        </div>
      ))}
    </div>
  );
}
