import { describe, it, expect, vi, afterEach } from 'vitest';
import { coinId, toCoinGeckoDate, coinGeckoQuote, coinGeckoHistoricalQuote, coinGeckoRangeSeries } from './coingecko';

describe('coinId', () => {
  it('bilinen sembolleri coin id\'ye çevirir', () => {
    expect(coinId('BTC')).toBe('bitcoin');
    expect(coinId('eth')).toBe('ethereum');
  });

  it('bilinmeyen sembol için null döner', () => {
    expect(coinId('XYZ')).toBeNull();
  });
});

describe('toCoinGeckoDate', () => {
  // CoinGecko yanlış biçimi HATA VERMEDEN sessizce başka bir tarihin (bugünün)
  // verisini döndürüyor (ölçüldü) — bu yüzden biçim dönüşümü ayrı test ediliyor.
  it('YYYY-MM-DD -> dd-mm-yyyy çevirir', () => {
    expect(toCoinGeckoDate('2026-06-15')).toBe('15-06-2026');
  });

  it('tek haneli gün/ay biçimini korur (sıfır dolgulu)', () => {
    expect(toCoinGeckoDate('2026-01-05')).toBe('05-01-2026');
  });

  it('geçersiz biçimde null döner, olduğu gibi geçirmez', () => {
    expect(toCoinGeckoDate('15-06-2026')).toBeNull();
    expect(toCoinGeckoDate('2026/06/15')).toBeNull();
    expect(toCoinGeckoDate('')).toBeNull();
    expect(toCoinGeckoDate('not-a-date')).toBeNull();
  });
});

describe('coinGeckoQuote / coinGeckoHistoricalQuote', () => {
  const savedKey = process.env.COINGECKO_API_KEY;
  const savedFetch = global.fetch;
  afterEach(() => {
    process.env.COINGECKO_API_KEY = savedKey;
    global.fetch = savedFetch;
  });

  function mockFetch(response: unknown) {
    const fn = vi.fn(async (url: string) => { fn.lastUrl = url; return { json: async () => response } as Response; }) as
      typeof fetch & { lastUrl?: string };
    global.fetch = fn;
    return fn;
  }

  // NOT: her test farklı bir coin/tarih kullanıyor — cached() süreç genelinde
  // paylaşılan tek bir Map, aynı sembolü art arda sorgulamak bir önceki
  // testin TTL önbelleğine çarpıp isteği hiç atmadan eski sonucu döndürür
  // (bu dosyada bir kez yaşandı, düzeltildi).

  it('anahtar yokken x_cg_demo_api_key eklemez', async () => {
    delete process.env.COINGECKO_API_KEY;
    const fn = mockFetch({ bitcoin: { try: 3724139, usd: 77518 } });
    await coinGeckoQuote('BTC');
    expect(fn.lastUrl).not.toContain('x_cg_demo_api_key');
    expect(fn.lastUrl).toContain('simple/price?ids=bitcoin');
  });

  it('anahtar varsa x_cg_demo_api_key ekler', async () => {
    process.env.COINGECKO_API_KEY = 'test-key-123';
    const fn = mockFetch({ ethereum: { try: 117983, usd: 2455.81 } });
    await coinGeckoQuote('ETH');
    expect(fn.lastUrl).toContain('x_cg_demo_api_key=test-key-123');
  });

  it('simple/price yanıtından TL ve USD okur', async () => {
    mockFetch({ solana: { try: 8500, usd: 177.2 } });
    expect(await coinGeckoQuote('SOL')).toEqual({ priceTRY: 8500, priceUSD: 177.2 });
  });

  it('coin id yanıtta yoksa null döner', async () => {
    mockFetch({});
    expect(await coinGeckoQuote('DOGE')).toBeNull();
  });

  it('history yanıtından market_data.current_price okur', async () => {
    mockFetch({ market_data: { current_price: { try: 3041894.27, usd: 65709.31 } } });
    expect(await coinGeckoHistoricalQuote('BTC', '2026-06-15')).toEqual({ priceTRY: 3041894.27, priceUSD: 65709.31 });
  });

  // 365 günden eski tarihler için CoinGecko error_code 10012 ile açık hata
  // döndürüyor (market_data hiç yok) — sessiz yanlış veri değil, null'a düşüp
  // Yahoo yedeğini tetiklemeli.
  it('market_data yoksa (365 gün sınırı vb.) null döner', async () => {
    mockFetch({ error: { status: { error_code: 10012 } } });
    expect(await coinGeckoHistoricalQuote('BTC', '2023-06-15')).toBeNull();
  });

  it('geçersiz tarih biçiminde API\'ye hiç gitmez, null döner', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    expect(await coinGeckoHistoricalQuote('BTC', 'bad-date')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('bilinmeyen coin için API\'ye hiç gitmez, null döner', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    expect(await coinGeckoQuote('NOTACOIN')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// app/api/history/route.ts'teki "ETH sessizce hisse yoluna düşüp Yahoo'da
// yanlış bir enstrümanın verisini çekiyordu" hatasını düzelten fonksiyon —
// bkz. o dosyadaki crypto dalının yorumu.
describe('coinGeckoRangeSeries', () => {
  const savedFetch = global.fetch;
  afterEach(() => { global.fetch = savedFetch; });

  function mockFetch(response: unknown) {
    global.fetch = vi.fn(async () => ({ json: async () => response } as Response)) as typeof fetch;
  }

  it('market_chart/range yanıtından günlük seri kurar', async () => {
    mockFetch({ prices: [
      [1780358400000, 92040.9], // 2026-06-02
      [1780444800000, 85730.8], // 2026-06-03
    ] });
    const series = await coinGeckoRangeSeries('ETH', '2026-06-01', '2026-06-10');
    expect(series).toEqual({ currency: 'TRY', prices: { '2026-06-02': 92040.9, '2026-06-03': 85730.8 } });
  });

  // CoinGecko kısa aralıklarda saatlik nokta döndürüyor (ölçüldü: 9 gün için
  // 217 nokta) — aynı güne ait birden fazla nokta gelirse EN SON (en büyük
  // ts) değer kalmalı, sıraya güvenilmeden.
  it('aynı güne ait çoklu noktada en son (en büyük ts) değeri tutar', async () => {
    const day = new Date('2026-06-02T00:00:00Z').getTime();
    mockFetch({ prices: [
      [day + 3 * 3600_000, 100], // 03:00, ilk gelen ama daha erken saat
      [day + 20 * 3600_000, 105], // 20:00, günün son değeri
      [day + 10 * 3600_000, 102], // 10:00, ortada — göz ardı edilmeli
    ] });
    const series = await coinGeckoRangeSeries('ETH', '2026-06-01', '2026-06-10');
    expect(series?.prices['2026-06-02']).toBe(105);
  });

  it('bilinmeyen coin için API\'ye hiç gitmez, null döner', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    expect(await coinGeckoRangeSeries('NOTACOIN', '2026-06-01', '2026-06-10')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('boş/hatalı yanıtta null döner (çağıran Yahoo\'ya düşer)', async () => {
    mockFetch({ error: { status: { error_code: 10012 } } });
    expect(await coinGeckoRangeSeries('BTC', '2020-01-01', '2020-01-10')).toBeNull();
  });

  it('0 veya negatif fiyatlı noktaları atlar', async () => {
    mockFetch({ prices: [[1780358400000, 0], [1780444800000, -5], [1780531200000, 90000]] });
    const series = await coinGeckoRangeSeries('ETH', '2026-06-01', '2026-06-10');
    expect(Object.keys(series?.prices ?? {})).toEqual(['2026-06-04']);
  });
});
