import { describe, expect, it } from 'vitest';

import { plaudActionItems } from './plaud';

describe('plaudActionItems', () => {
  const notes = [
    '### Catatan Rapat',
    '- Renegotiate courier rate before Q3 close', // plain bullet, NOT a task
    '',
    '### Pengaturan Selanjutnya',
    '- [ ] Kirim daftar warna dan kuantitas stok lama',
    '- [ ] Tentukan sistem pembayaran (beli putus vs. progres)',
    '- [x] Pisahkan stok sisa dari stok yang ditolak',
    '- [ ] **Jadwalkan** sesi teknis',
    '- [ ] [Masukkan lainnya]',
  ].join('\n');

  it('extracts GFM task-list items only (not plain bullets)', () => {
    const items = plaudActionItems(notes);
    expect(items.map((i) => i.text)).toEqual([
      'Kirim daftar warna dan kuantitas stok lama',
      'Tentukan sistem pembayaran (beli putus vs. progres)',
      'Pisahkan stok sisa dari stok yang ditolak',
      'Jadwalkan sesi teknis', // emphasis stripped
    ]);
  });

  it('marks checked items done', () => {
    const items = plaudActionItems(notes);
    expect(items.find((i) => i.text.startsWith('Pisahkan'))?.done).toBe(true);
    expect(items.find((i) => i.text.startsWith('Kirim'))?.done).toBe(false);
  });

  it('skips "[Masukkan lainnya]" placeholder rows', () => {
    expect(plaudActionItems(notes).some((i) => i.text.includes('Masukkan'))).toBe(false);
  });

  it('returns [] for notes with no task list', () => {
    expect(plaudActionItems('## Summary\n- a point\n- another')).toEqual([]);
  });
});
