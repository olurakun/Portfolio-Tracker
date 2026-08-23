import { describe, it, expect, vi, afterEach } from 'vitest';
import { coinId, toCoinGeckoDate, coinGeckoQuote, coinGeckoHistoricalQuote } from './coingecko';

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
