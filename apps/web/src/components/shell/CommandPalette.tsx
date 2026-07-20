'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useKeyboard } from '../../lib/keyboard';

const COMMANDS = [
  { label: 'Go to Today', href: '/today' },
  { label: 'Go to Meetings', href: '/meetings' },
  { label: 'Go to Actions', href: '/actions' },
  { label: 'Go to Pipeline', href: '/pipeline' },
  { label: 'Go to Upcoming', href: '/upcoming' },
  { label: 'Go to Conversations', href: '/conversations' },
  { label: 'Go to Digests', href: '/digests' },
  { label: 'Go to Memory', href: '/memory' },
  { label: 'Go to Settings', href: '/settings' },
];

export function CommandPalette() {
  const router = useRouter();
  const { onPalette } = useKeyboard();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => onPalette(() => setOpen(true)), [onPalette]);

  if (!open) return null;
  const filtered = COMMANDS.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));
  const go = (href: string) => {
    router.push(href);
    setOpen(false);
    setQuery('');
    setIndex(0);
  };

  return (
    <div className="palette-scrim" onMouseDown={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Type a command…"
          value={query}
          aria-label="Command palette"
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && filtered[index]) {
              go(filtered[index]!.href);
            }
          }}
        />
        {filtered.map((c, idx) => (
          <button
            key={c.href}
            className="palette-item"
            aria-selected={idx === index}
            onMouseEnter={() => setIndex(idx)}
            onClick={() => go(c.href)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
