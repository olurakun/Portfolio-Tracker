import { describe, it, expect } from 'vitest';
import { createLimiter, withRetry } from './limit';

describe('createLimiter', () => {
  // Asıl mesele bu: TEFAS 14 eşzamanlı istekte bağlantı düşürüyordu.
  it('eşzamanlı çalışan iş sayısını sınırda tutar', async () => {
    const limit = createLimiter(4);
    let active = 0, peak = 0;

    await Promise.all(Array.from({ length: 20 }, () =>
      limit(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(r => setTimeout(r, 5));
        active--;
      })
    ));

    expect(peak).toBeLessThanOrEqual(4);
  });

  it('bütün işleri çalıştırır ve sonuçları döndürür', async () => {
    const limit = createLimiter(2);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => limit(async () => i * 2))
    );
    expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  });

  it('bir iş hata verse de kuyruk tıkanmaz', async () => {
    const limit = createLimiter(1);
    await expect(limit(async () => { throw new Error('patladi'); })).rejects.toThrow('patladi');
    // Sonraki iş yine çalışabilmeli.
    expect(await limit(async () => 'ok')).toBe('ok');
  });
});

describe('withRetry', () => {
  it('başarılıysa tek kez çalıştırır', async () => {
    let calls = 0;
    const r = await withRetry(async () => { calls++; return 'ok'; }, v => v !== 'ok');
    expect([r, calls]).toEqual(['ok', 1]);
  });

  it('başarısızsa yeniden dener', async () => {
    let calls = 0;
    const r = await withRetry(
      async () => { calls++; return calls < 3 ? null : 'ok'; },
      v => v === null,
      3, 1,
    );
    expect([r, calls]).toEqual(['ok', 3]);
  });

  it('deneme hakkı bitince son sonucu döndürür', async () => {
    let calls = 0;
    const r = await withRetry(async () => { calls++; return null; }, v => v === null, 3, 1);
    expect([r, calls]).toEqual([null, 3]);
  });
});
