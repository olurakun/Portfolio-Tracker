import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cached, clearTtlCache } from './ttlCache';

describe('history kaynak TTL davranışı', () => {
  beforeEach(() => clearTtlCache());
  const TTL = 6 * 60 * 60 * 1000;
  const ok = () => ({ currency: 'TRY', prices: { '2026-08-20': 10 } });

  it('TTL içinde ikinci çağrı kaynağa GİTMEZ', async () => {
    const src = vi.fn(async () => ok());
    const key = 'history:AFA:fund:2026-01-01:2026-08-23';
    await cached(key, TTL, src, r => r !== null && Object.keys(r.prices).length > 0);
    await cached(key, TTL, src, r => r !== null && Object.keys(r.prices).length > 0);
    expect(src).toHaveBeenCalledTimes(1);
  });

  it('54 fon aynı anda istenirse her fon için TEK istek gider', async () => {
    const calls: string[] = [];
    const make = (sym: string) => cached(
      `history:${sym}:fund:2026-01-01:2026-08-23`, TTL,
      async () => { calls.push(sym); return ok(); },
      r => r !== null && Object.keys(r.prices).length > 0,
    );
    const syms = Array.from({ length: 54 }, (_, i) => `FON${i}`);
    await Promise.all([...syms.map(make), ...syms.map(make)]); // her biri İKİ kez istendi
    expect(calls.length).toBe(54); // 108 değil
  });

  it('boş sonuç ÖNBELLEKLENMEZ — geçici kesinti TTL boyunca donmamalı', async () => {
    const src = vi.fn(async () => ({ currency: 'TRY', prices: {} }));
    const key = 'history:BOS:fund:2026-01-01:2026-08-23';
    const guard = (r: { prices: object } | null) => r !== null && Object.keys(r.prices).length > 0;
    await cached(key, TTL, src, guard);
    await cached(key, TTL, src, guard);
    expect(src).toHaveBeenCalledTimes(2);
  });

  it('null sonuç da ÖNBELLEKLENMEZ', async () => {
    const src = vi.fn(async () => null);
    const key = 'history:NULL:fund:2026-01-01:2026-08-23';
    const guard = (r: { prices: object } | null) => r !== null && Object.keys(r.prices).length > 0;
    await cached(key, TTL, src, guard);
    await cached(key, TTL, src, guard);
    expect(src).toHaveBeenCalledTimes(2);
  });

  it('farklı sembol/aralık ayrı anahtar — birbirine karışmaz', async () => {
    const src = vi.fn(async () => ok());
    const guard = (r: { prices: object } | null) => r !== null && Object.keys(r.prices).length > 0;
    await cached('history:AFA:fund:2026-01-01:2026-08-23', TTL, src, guard);
    await cached('history:TTE:fund:2026-01-01:2026-08-23', TTL, src, guard);
    await cached('history:AFA:fund:2025-01-01:2026-08-23', TTL, src, guard);
    expect(src).toHaveBeenCalledTimes(3);
  });
});
