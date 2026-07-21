import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NavRail } from './NavRail';

const mockPathname = vi.fn(() => '/today');
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname() }));

const LABELS = [
  'Today',
  'Conversations',
  'Upcoming',
  'Actions',
  'Meetings',
  'Digests',
  'Memory',
  'Pipeline',
  'Settings',
];

describe('NavRail', () => {
  it('gives every item an accessible name — the rail is icon-only, so this is the only label', () => {
    const { getByRole } = render(<NavRail />);
    for (const label of LABELS) {
      expect(getByRole('link', { name: label })).toBeTruthy();
    }
  });

  it('renders a real icon per item, not a text glyph', () => {
    // Guards the regression this replaced: single mono letters standing in for icons.
    const { container } = render(<NavRail />);
    const links = container.querySelectorAll('a.nav-item');
    expect(links).toHaveLength(LABELS.length);
    for (const link of links) {
      expect(link.querySelector('svg')).toBeTruthy();
      expect(link.textContent?.trim()).toBe('');
    }
  });

  it('hides icons from the accessibility tree so the aria-label is not doubled', () => {
    const { container } = render(<NavRail />);
    for (const svg of container.querySelectorAll('a.nav-item svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('marks only the active route with aria-current', () => {
    mockPathname.mockReturnValue('/memory');
    const { getByRole } = render(<NavRail />);
    expect(getByRole('link', { name: 'Memory' }).getAttribute('aria-current')).toBe('page');
    expect(getByRole('link', { name: 'Today' }).getAttribute('aria-current')).toBeNull();
  });

  it('exposes the go-to shortcut in the tooltip', () => {
    mockPathname.mockReturnValue('/today');
    const { getByRole } = render(<NavRail />);
    expect(getByRole('link', { name: 'Conversations' }).getAttribute('title')).toBe('Conversations — g c');
  });
});
