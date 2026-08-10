import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MeetingNotes } from './MeetingNotes';

describe('MeetingNotes', () => {
  it('renders markdown structure instead of raw ## and ** (the reported bug)', () => {
    const { container, getByText } = render(
      <MeetingNotes markdown={'## Catatan Rapat\n\n- **Analisis:** produk **ACP**\n'} />,
    );
    // Heading becomes an <h2>, not literal "## Catatan Rapat".
    const h2 = container.querySelector('h2');
    expect(h2?.textContent).toBe('Catatan Rapat');
    // Bold becomes <strong>, not literal **.
    expect(container.querySelector('strong')?.textContent).toBe('Analisis:');
    expect(container.textContent).not.toContain('##');
    expect(container.textContent).not.toContain('**');
    expect(getByText('ACP')).toBeTruthy();
  });

  it('renders GFM task lists (Plaud action items) as checkboxes', () => {
    const { container } = render(
      <MeetingNotes markdown={'## Pengaturan Selanjutnya\n\n- [ ] Kirim daftar warna\n- [x] Pisahkan stok\n'} />,
    );
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect((boxes[1] as HTMLInputElement).checked).toBe(true);
  });

  it('renders `>` callout blocks as blockquotes (Informasi Rapat / Saran AI)', () => {
    const { container } = render(
      <MeetingNotes markdown={'> **Informasi Rapat**\n> Tanggal: 4 Agustus 2026\n'} />,
    );
    expect(container.querySelector('blockquote')).toBeTruthy();
  });
});
