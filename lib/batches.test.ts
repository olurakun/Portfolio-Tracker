import { describe, it, expect } from 'vitest';
import { groupIntoBatches } from '../app/components/TransactionsTab';

const tx = (id: number, created_at?: string) => ({
  id, asset_id: 1, type: 'buy' as const, quantity: 1, price: 1, date: '2026-01-01', created_at,
});

// Bir "parti", yanlış aktarılan dosyayı topluca geri almak için gereken birim.
describe('groupIntoBatches', () => {
  it('yakın zamanlı kayıtları tek partide toplar', () => {
    const b = groupIntoBatches([
      tx(1, '2026-08-17T23:31:00Z'),
      tx(2, '2026-08-17T23:31:05Z'),
      tx(3, '2026-08-17T23:31:20Z'),
    ]);
    expect(b).toHaveLength(1);
    expect(b[0].rows.map(r => r.id)).toEqual([1, 2, 3]);
  });

  it('araya uzun boşluk girerse ayrı parti sayar', () => {
    const b = groupIntoBatches([
      tx(1, '2026-08-17T08:20:00Z'),
      tx(2, '2026-08-17T08:20:10Z'),
      tx(3, '2026-08-17T23:31:00Z'),
      tx(4, '2026-08-17T23:31:05Z'),
    ]);
    expect(b).toHaveLength(2);
    // En yeni parti başta olmalı — kullanıcı genelde son aktarmayı geri alır.
    expect(b[0].rows.map(r => r.id)).toEqual([3, 4]);
    expect(b[1].rows.map(r => r.id)).toEqual([1, 2]);
  });

  // Elle girilen tek kayıtlar "aktarma" değildir; toplu silme listesinde çıkmamalı.
  it('tek başına duran kaydı parti saymaz', () => {
    expect(groupIntoBatches([tx(1, '2026-08-17T10:00:00Z')])).toEqual([]);
  });

  it('birbirinden uzak tek kayıtları parti saymaz', () => {
    expect(groupIntoBatches([
      tx(1, '2026-08-17T10:00:00Z'),
      tx(2, '2026-08-17T14:00:00Z'),
    ])).toEqual([]);
  });

  it('zaman damgası olmayan kayıtları yok sayar', () => {
    const b = groupIntoBatches([tx(1), tx(2), tx(3, '2026-08-17T10:00:00Z')]);
    expect(b).toEqual([]);
  });

  it('sırasız gelen kayıtları zamana göre toplar', () => {
    const b = groupIntoBatches([
      tx(3, '2026-08-17T23:31:20Z'),
      tx(1, '2026-08-17T23:31:00Z'),
      tx(2, '2026-08-17T23:31:05Z'),
    ]);
    expect(b).toHaveLength(1);
    expect(b[0].rows.map(r => r.id)).toEqual([1, 2, 3]);
  });

  it('boş listede boş döner', () => {
    expect(groupIntoBatches([])).toEqual([]);
  });
});
