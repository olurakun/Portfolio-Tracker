import { describe, it, expect, beforeEach } from 'vitest';
import { cached, clearTtlCache } from './ttlCache';

beforeEach(() => clearTtlCache());

describe('cached', () => {
  it('ilk çağrıda yükleyiciyi çalıştırır', async () => {
    let calls = 0;
    const v = await cached('k', 1000, async () => { calls++; return 42; });
    expect(v).toBe(42);
    expect(calls).toBe(1);
  });

  it('süre dolmadan yükleyiciyi tekrar çalıştırmaz', async () => {
    let calls = 0;
    const load = async () => { calls++; return 42; };
    await cached('k', 1000, load);
    await cached('k', 1000, load);
    await cached('k', 1000, load);
    expect(calls).toBe(1);
  });

  it('süre dolunca yeniden yükler', async () => {
    let calls = 0;
    const load = async () => { calls++; return calls; };
    await cached('k', 1, load);
    await new Promise(r => setTimeout(r, 10));
    const v = await cached('k', 1, load);
    expect(calls).toBe(2);
    expect(v).toBe(2);
  });

  // Asıl kazanç bu: 22 varlık aynı anda kuru isterse dışarıya 1 istek gider.
  it('eşzamanlı istekleri tek çağrıya bindirir', async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      await new Promise(r => setTimeout(r, 20));
      return 7;
    };
    const results = await Promise.all(
      Array.from({ length: 22 }, () => cached('k', 1000, load))
    );
    expect(calls).toBe(1);
    expect(results.every(r => r === 7)).toBe(true);
  });

  it('farklı anahtarları karıştırmaz', async () => {
    const a = await cached('a', 1000, async () => 'A');
    const b = await cached('b', 1000, async () => 'B');
    expect([a, b]).toEqual(['A', 'B']);
  });

  it('hata sonrası bir sonraki çağrıda tekrar dener', async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      if (calls === 1) throw new Error('gecici hata');
      return 'ok';
    };
    await expect(cached('k', 1000, load)).rejects.toThrow('gecici hata');
    expect(await cached('k', 1000, load)).toBe('ok');
    expect(calls).toBe(2);
  });
});
