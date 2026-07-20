import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Chip, StatusDot, Tabs } from './primitives';

describe('primitives', () => {
  it('Chip renders its children', () => {
    const { getByText } = render(<Chip>Bot active</Chip>);
    expect(getByText('Bot active')).toBeTruthy();
  });

  it('StatusDot colours by status', () => {
    const { container } = render(<StatusDot status="ok" />);
    expect((container.firstChild as HTMLElement).style.background).toContain('--ok');
  });

  it('Tabs marks the active tab and fires onChange', () => {
    const onChange = vi.fn();
    const { getByRole } = render(<Tabs tabs={['Open', 'Done'] as const} value="Open" onChange={onChange} />);
    const done = getByRole('tab', { name: 'Done' });
    expect(getByRole('tab', { name: 'Open' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(done);
    expect(onChange).toHaveBeenCalledWith('Done');
  });
});
