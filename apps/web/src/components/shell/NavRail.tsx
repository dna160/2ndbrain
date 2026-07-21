'use client';
import {
  Activity,
  Brain,
  CalendarClock,
  ListChecks,
  MessageSquare,
  Mic,
  Newspaper,
  Settings,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Icon-only rail (docs/02 §3). Icons are 20px lucide strokes inheriting `currentColor`, so the
// rail's hover / aria-current[page] colour rules in app.css drive them with no extra CSS.
// The tooltip carries the full label + its go-to shortcut.
const ITEMS: Array<{ href: string; label: string; key: string; Icon: LucideIcon }> = [
  { href: '/today', label: 'Today', key: 't', Icon: Sun },
  { href: '/conversations', label: 'Conversations', key: 'c', Icon: MessageSquare },
  { href: '/upcoming', label: 'Upcoming', key: 'u', Icon: CalendarClock },
  { href: '/actions', label: 'Actions', key: 'a', Icon: ListChecks },
  // Mic, not Users: Recall's meetings are recordings that become transcripts, and it keeps
  // this visually distinct from the Conversations speech bubble.
  { href: '/meetings', label: 'Meetings', key: 'm', Icon: Mic },
  { href: '/digests', label: 'Digests', key: 'd', Icon: Newspaper },
  { href: '/memory', label: 'Memory', key: 'y', Icon: Brain },
  { href: '/pipeline', label: 'Pipeline', key: 'p', Icon: Activity },
  { href: '/settings', label: 'Settings', key: ',', Icon: Settings },
];

export function NavRail() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Primary">
      {ITEMS.map(({ href, label, key, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="nav-item"
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            title={`${label} — g ${key}`}
          >
            <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden focusable="false" />
          </Link>
        );
      })}
    </nav>
  );
}
