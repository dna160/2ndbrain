'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Icon-only rail (docs/02 §3). Glyphs are single mono letters as a lean stand-in for an icon
// set; tooltip carries the full label + go-to shortcut. Real icons are a later polish pass.
const ITEMS = [
  { href: '/today', label: 'Today', key: 't', glyph: 'T' },
  { href: '/conversations', label: 'Conversations', key: 'c', glyph: 'C' },
  { href: '/upcoming', label: 'Upcoming', key: 'u', glyph: 'U' },
  { href: '/actions', label: 'Actions', key: 'a', glyph: 'A' },
  { href: '/meetings', label: 'Meetings', key: 'm', glyph: 'M' },
  { href: '/digests', label: 'Digests', key: 'd', glyph: 'D' },
  { href: '/memory', label: 'Memory', key: 'y', glyph: 'Y' },
  { href: '/pipeline', label: 'Pipeline', key: 'p', glyph: 'P' },
  { href: '/settings', label: 'Settings', key: ',', glyph: 'S' },
];

export function NavRail() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Primary">
      {ITEMS.map((it) => {
        const active = pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className="nav-item"
            aria-current={active ? 'page' : undefined}
            aria-label={it.label}
            title={`${it.label} — g ${it.key}`}
          >
            <span className="mono" aria-hidden style={{ fontSize: 'var(--text-md)' }}>
              {it.glyph}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
