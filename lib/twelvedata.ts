import { cached } from "./ttlCache";

/**
 * Twelve Data — hisse ve değerli maden fiyatları için YEDEK kaynak.
 *
 * Birincil kaynak Yahoo Finance; burası yalnızca Yahoo `null` döndüğünde
 * devreye giriyor. Sebep: Yahoo'nun resmî API'si ve ticari kullanım lisansı
 * yok, ama kapsamı geniş ve kotasız. Twelve Data lisanslı ve BIST'i tam
 * kapsıyor (652 sembol) — buna karşılık ücretsiz katmanda GÜNDE 800 KREDİ
 * sınırı var ve kredi istek başına değil SEMBOL başına sayılıyor
 * (`symbol=A,B,C` tek çağrı, üç kredi). Yani yedek kaynağın kotası, Yahoo
 * uzun süre çökerse hızla tükenebilir; sonuçlar bu yüzden önbelleğe alınıyor.
 *
 * Kapsamadıkları: TEFAS fonları (Türk fon kodları yok, "Turkey" altındaki
 * fonlar yurtdışı fonların BIST kotasyonu) ve döviz — döviz zaten
 * Frankfurter'den geliyor, bkz. lib/fx.ts.
 */

const BASE_URL = 'https://api.twelvedata.com';

// Yedek kaynak olduğu için Yahoo'dan daha uzun tutuluyor: Yahoo çökmüşse
// her sayfa açılışı buraya düşer ve 800 kredilik günlük kota erir.
const QUOTE_TTL_MS = 15 * 60 * 1000;
const HISTORICAL_TTL_MS = 24 * 60 * 60 * 1000;

export type TwelveQuote = { price: number; currency: string };

/**
 * Uygulamanın sembolünü Twelve Data'nın beklediği biçime çevirir.
 * `null` dönerse bu varlık tipi Twelve Data'da aranmaz.
 *
 * - Hisse: BIST sembolleri Yahoo'da `THYAO.IS`, Twelve Data'da `THYAO`.
 *   Sonek gönderilirse 404 dönüyor; borsa parametresi ise gerekmiyor,
 *   çıplak sembol BIST'e çözülüyor.
 * - Maden: `XAU/USD` spot fiyatı, ONS başına — Yahoo'nun vadeli sözleşmesiyle
 *   (`GC=F`) aynı birim, dolayısıyla gram çevrimi çağıranda değişmeden kalır.
 *   Spot ile vadeli birebir aynı fiyat değildir; yedek devredeyken küçük bir
 *   fiyat sıçraması normaldir.
 */
export function twelveDataSymbol(symbol: string, type: string | null): string | null {
  const upper = symbol.toUpperCase().trim();
  if (type === 'metal') {
    if (upper === 'XAU' || upper === 'XAUOZ') return 'XAU/USD';
    if (upper === 'XAG' || upper === 'XAGOZ') return 'XAG/USD';
    return null;
  }
  // Fon ve döviz burada aranmıyor (yukarıdaki not).
  if (type === 'fund' || type === 'currency') return null;
  const bare = upper.replace(/\.IS$/, '');
  return bare || null;
}

function apiKey(): string | null {
  const key = process.env.TWELVE_DATA_API_KEY?.trim();
  return key ? key : null;
}

/**
 * Twelve Data kullanılsın mı.
 *
 * ANAHTARIN VARLIĞI TEK BAŞINA YETMEZ — ayrıca `TWELVE_DATA_ENABLED=true`
 * gerekiyor. Sebebi somut: ücretsiz Basic anahtarı denemeler için .env.local'de
 * duruyordu ve yalnızca anahtara bakan bir kontrol, kimse istemeden ücretsiz
 * kotayı harcamaya başladı (bir kez yaşandı, 7 kredi). Ücretli Venture planına
 * geçilene kadar kapalı kalmalı; açmak bilinçli bir hareket olmalı.
 */
export function twelveDataConfigured(): boolean {
  if (process.env.TWELVE_DATA_ENABLED?.trim().toLowerCase() !== 'true') return false;
  return apiKey() !== null;
}

/**
 * Twelve Data yanıtını okur. Hata gövdeleri de 200 ile dönebildiği için
 * (`{"code":404,...}`) durum kodu tek başına yeterli değil.
 */
function readQuote(payload: unknown): TwelveQuote | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.code === 'number' && obj.code !== 200) return null;
  const price = Number(obj.close);
  const currency = obj.currency;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (typeof currency !== 'string' || !currency) return null;
  return { price, currency };
}

/** Zaman serisinden `date` tarihine kadarki (o gün dahil) SON kapanışı seçer. */
function readSeriesClose(payload: unknown, currency: string | null): TwelveQuote | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.code === 'number' && obj.code !== 200) return null;
  const values = obj.values;
  if (!Array.isArray(values) || values.length === 0) return null;
  const meta = obj.meta as Record<string, unknown> | undefined;
  const cur = currency ?? (typeof meta?.currency === 'string' ? meta.currency : null);
  if (!cur) return null;
  // Seri en yeniden eskiye sıralı geliyor; ilk geçerli kapanış aradığımız gün
  // ya da ondan önceki son işlem günü.
  for (const v of values) {
    const price = Number((v as Record<string, unknown>)?.close);
    if (Number.isFinite(price) && price > 0) return { price, currency: cur };
  }
  return null;
}

async function request(path: string): Promise<unknown | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch(`${BASE_URL}/${path}&apikey=${encodeURIComponent(key)}`, {
      cache: 'no-store',
    });
    return await res.json();
  } catch {
    return null;
  }
}

/** Güncel fiyat. Bulunamazsa/kota dolmuşsa `null`. */
export async function twelveDataQuote(symbol: string, type: string | null): Promise<TwelveQuote | null> {
  const mapped = twelveDataSymbol(symbol, type);
  if (mapped === null || !twelveDataConfigured()) return null;
  return cached(
    `td:quote:${mapped}`,
    QUOTE_TTL_MS,
    async () => readQuote(await request(`quote?symbol=${encodeURIComponent(mapped)}`)),
    q => q !== null,
  );
}

/** `date` tarihindeki (ya da ondan önceki son işlem günündeki) kapanış. */
export async function twelveDataHistoricalQuote(
  symbol: string, type: string | null, date: string,
): Promise<TwelveQuote | null> {
  const mapped = twelveDataSymbol(symbol, type);
  if (mapped === null || !twelveDataConfigured()) return null;
  return cached(
    `td:hist:${mapped}:${date}`,
    HISTORICAL_TTL_MS,
    async () => {
      // Hafta sonu/tatil için 10 günlük pencere — Yahoo yolundaki mantığın aynısı.
      const end = new Date(`${date}T00:00:00Z`);
      const start = new Date(end.getTime() - 10 * 24 * 60 * 60 * 1000);
      const q = `time_series?symbol=${encodeURIComponent(mapped)}&interval=1day`
        + `&start_date=${start.toISOString().slice(0, 10)}&end_date=${date}`;
      return readSeriesClose(await request(q), null);
    },
    q => q !== null,
  );
}
