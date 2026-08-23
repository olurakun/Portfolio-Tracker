import { cached } from "./ttlCache";

/**
 * CoinGecko — kripto fiyatları için birincil kaynak (Yahoo yedekte).
 *
 * ANAHTAR ŞART DEĞİL. `api.coingecko.com` anahtarsız da çalışıyor (IP bazlı
 * hız sınırlı "Public" kullanım) — ölçüldü, gerçek veri dönüyor. Demo anahtarı
 * (COINGECKO_API_KEY) tanımlıysa aynı isteklere eklenip DAHA KARARLI bir kotaya
 * geçiliyor (100/dk, 10.000/ay); tanımlı değilse anahtarsız devam ediliyor
 * (belgelenmemiş, bildirilen aralık 5-15/dk — garantisiz ama bu uygulamanın
 * kullanım deseniyle (günde bir toplu yenileme, birkaç sembol) rahatça yeterli).
 * İkisi de AYNI temel adresi kullanıyor, tek fark `x_cg_demo_api_key` sorgu
 * parametresinin eklenip eklenmediği.
 *
 * Lisans (coingecko.com/en/api_terms, doğrulandı): ticari ürüne entegre etmek
 * serbest ("you are entitled to charge for your services and products that
 * incorporate our CoinGecko API"), yasak olan API erişimini yeniden satmak.
 * Atıf zorunlu — bkz. DataSources.tsx.
 *
 * SINIR: ücretsiz/anahtarsız katmanda geçmiş veri yalnızca SON 365 GÜN
 * (ölçüldü: daha eskisi error_code 10012 ile açıkça reddediliyor — sessiz
 * yanlış veri değil, null'a düşüp Yahoo yedeğini tetikliyor).
 */

const BASE_URL = 'https://api.coingecko.com/api/v3';
const QUOTE_TTL_MS = 15 * 60 * 1000;
const HISTORICAL_TTL_MS = 24 * 60 * 60 * 1000;

export type CoinGeckoQuote = { priceTRY: number; priceUSD: number };

// Uygulamanın sembollerini (BTC, ETH...) CoinGecko'nun "coin id"lerine
// (bitcoin, ethereum...) çevirir. CoinGecko sembolle değil id'yle sorgulanıyor
// çünkü sembol tekil değil (birden fazla coin aynı sembolü paylaşabiliyor).
// Yalnızca uygulamanın arama sonuçlarında fiilen çıkabilecek başlıca coin'ler
// listelendi; kapsam genişledikçe büyütülmeli.
const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', DOGE: 'dogecoin',
  BNB: 'binancecoin', XRP: 'ripple', ADA: 'cardano', AVAX: 'avalanche-2',
  DOT: 'polkadot', LTC: 'litecoin', LINK: 'chainlink', MATIC: 'matic-network',
};

export function coinId(symbol: string): string | null {
  return COIN_IDS[symbol.toUpperCase()] ?? null;
}

function apiKey(): string | null {
  const key = process.env.COINGECKO_API_KEY?.trim();
  return key ? key : null;
}

/** `YYYY-MM-DD` (uygulamanın iç biçimi) -> `dd-mm-yyyy` (CoinGecko'nun beklediği).
 *  YANLIŞ BİÇİM SESSİZCE YANLIŞ TARİHİN VERİSİNİ DÖNDÜRÜYOR (ölçüldü) — hata
 *  vermiyor, bu yüzden biçim burada TEK yerde ve testle sabitlendi. */
export function toCoinGeckoDate(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${d}-${mo}-${y}`;
}

async function request(path: string): Promise<unknown | null> {
  const key = apiKey();
  const sep = path.includes('?') ? '&' : '?';
  const url = key ? `${BASE_URL}/${path}${sep}x_cg_demo_api_key=${encodeURIComponent(key)}` : `${BASE_URL}/${path}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return await res.json();
  } catch {
    return null;
  }
}

function readSimplePrice(payload: unknown, coinId: string): CoinGeckoQuote | null {
  if (!payload || typeof payload !== 'object') return null;
  const entry = (payload as Record<string, unknown>)[coinId];
  if (!entry || typeof entry !== 'object') return null;
  const priceTRY = Number((entry as Record<string, unknown>).try);
  const priceUSD = Number((entry as Record<string, unknown>).usd);
  if (!Number.isFinite(priceTRY) || !Number.isFinite(priceUSD) || priceTRY <= 0 || priceUSD <= 0) return null;
  return { priceTRY, priceUSD };
}

function readHistorical(payload: unknown): CoinGeckoQuote | null {
  if (!payload || typeof payload !== 'object') return null;
  const marketData = (payload as Record<string, unknown>).market_data;
  if (!marketData || typeof marketData !== 'object') return null;
  const currentPrice = (marketData as Record<string, unknown>).current_price;
  if (!currentPrice || typeof currentPrice !== 'object') return null;
  const priceTRY = Number((currentPrice as Record<string, unknown>).try);
  const priceUSD = Number((currentPrice as Record<string, unknown>).usd);
  if (!Number.isFinite(priceTRY) || !Number.isFinite(priceUSD) || priceTRY <= 0 || priceUSD <= 0) return null;
  return { priceTRY, priceUSD };
}

/** Güncel fiyat, TL ve USD birlikte (kur çevrimi gerekmiyor). Bulunamazsa `null`. */
export async function coinGeckoQuote(symbol: string): Promise<CoinGeckoQuote | null> {
  const id = coinId(symbol);
  if (id === null) return null;
  return cached(
    `cg:quote:${id}`,
    QUOTE_TTL_MS,
    async () => readSimplePrice(await request(`simple/price?ids=${id}&vs_currencies=try,usd`), id),
    q => q !== null,
  );
}

export type PriceSeries = { currency: 'TRY'; prices: Record<string, number> };

function readRangeSeries(payload: unknown): PriceSeries | null {
  if (!payload || typeof payload !== 'object') return null;
  const points = (payload as Record<string, unknown>).prices;
  if (!Array.isArray(points) || points.length === 0) return null;
  // CoinGecko kısa aralıklarda saatlik nokta döndürüyor (ölçüldü: 9 gün için
  // 217 nokta); günün EN SON değeri tutulur, sırayla gelmesine güvenilmiyor —
  // her nokta için en yüksek ts görülürse üzerine yazılıyor.
  const latestTsByDay = new Map<string, number>();
  const prices: Record<string, number> = {};
  for (const point of points) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const [ts, price] = point;
    if (typeof ts !== 'number' || typeof price !== 'number' || price <= 0) continue;
    const day = new Date(ts).toISOString().slice(0, 10);
    const prevTs = latestTsByDay.get(day);
    if (prevTs === undefined || ts > prevTs) {
      latestTsByDay.set(day, ts);
      prices[day] = price;
    }
  }
  return Object.keys(prices).length > 0 ? { currency: 'TRY', prices } : null;
}

/**
 * `start`–`end` (YYYY-MM-DD) aralığındaki TÜM günlük fiyat serisi TEK
 * istekte — app/api/history/route.ts'teki yahooSeries/frankfurterSeries ile
 * aynı sözleşme (kasıtlı: kendi TTL önbelleği YOK, o dosyanın dış
 * lib/priceCache.ts katmanına bindiriliyor, çifte önbellek olmasın).
 * Ücretsiz katmanda son 365 günle sınırlı — daha eskisi `null` döner.
 */
export async function coinGeckoRangeSeries(symbol: string, start: string, end: string): Promise<PriceSeries | null> {
  const id = coinId(symbol);
  if (id === null) return null;
  const from = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
  const to = Math.floor(new Date(`${end}T23:59:59Z`).getTime() / 1000);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return readRangeSeries(await request(`coins/${id}/market_chart/range?vs_currency=try&from=${from}&to=${to}`));
}

/**
 * `date` (YYYY-MM-DD) tarihindeki fiyat. Ücretsiz katmanda son 365 günle
 * sınırlı — daha eskisi ya da başka bir hata `null` döner, çağıran Yahoo'ya
 * düşer (bkz. lib/priceFetch.ts).
 */
export async function coinGeckoHistoricalQuote(symbol: string, date: string): Promise<CoinGeckoQuote | null> {
  const id = coinId(symbol);
  const cgDate = toCoinGeckoDate(date);
  if (id === null || cgDate === null) return null;
  return cached(
    `cg:hist:${id}:${date}`,
    HISTORICAL_TTL_MS,
    async () => readHistorical(await request(`coins/${id}/history?date=${cgDate}&localization=false`)),
    q => q !== null,
  );
}
