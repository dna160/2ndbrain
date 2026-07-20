import type { StructuringTopic } from '@recall/shared';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TopicScrubber } from './TopicScrubber';

const topics: StructuringTopic[] = [
  { title: 'Topic A', startMs: 0, endMs: 15_000, subnotes: ['a1', 'a2'] },
  { title: 'Topic B', startMs: 15_000, endMs: 30_000, subnotes: ['b1'] },
];

describe('TopicScrubber', () => {
  it('positions topic blocks by their time span and calls onSelect on click', () => {
    const onSelect = vi.fn();
    const { getByRole } = render(
      <TopicScrubber topics={topics} totalMs={30_000} currentIndex={0} onSelect={onSelect} />,
    );
    const blockB = getByRole('button', { name: 'Topic: Topic B' });
    expect(blockB.style.left).toBe('50%');
    expect(blockB.style.width).toBe('50%');
    fireEvent.click(blockB);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('marks the current topic with aria-current', () => {
    const { getByRole } = render(
      <TopicScrubber topics={topics} totalMs={30_000} currentIndex={1} onSelect={() => {}} />,
    );
    expect(getByRole('button', { name: 'Topic: Topic B' }).getAttribute('aria-current')).toBe('true');
  });
});
