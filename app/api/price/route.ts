import { NextResponse } from "next/server";
import { fxRateUrl, readRate } from "../../../lib/fx";
import { cached } from "../../../lib/ttlCache";
import { tefasLatestPrice, tefasPriceOn } from "../../../lib/tefas";

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
};

const TROY_OUNCE_IN_GRAMS = 31.1034768;

// Değerli madenler Yahoo'da vadeli işlem sözleşmesi olarak (USD/ons) fiyatlanıyor.
// Türkiye'de gram üzerinden alım satım yaygın olduğu için hem gram hem ons
// varyantını ayrı sembol olarak sunuyoruz; sonek taşımayan sembol (XAU/XAG)
// gram anlamına gelir ve geriye dönük uyumluluk için öyle kalmalıdır.
const METAL_SPECS: Record<string, { ticker: string; perGram: boolean }> = {
  XAU: { ticker: 'GC=F', perGram: true },
  XAG: { ticker: 'SI=F', perGram: true },
  XAUOZ: { ticker: 'GC=F', perGram: false },
  XAGOZ: { ticker: 'SI=F', perGram: false },
};

// Portföyün ana para birimi — her şey bu birime çevrilip gösteriliyor.
// Ana para birimi kendi cinsinden her zaman 1 birim eder (1 TL = 1 TL), bu yüzden
// nakit olarak tutulan bakiye için dış servise sorulmaz.
const BASE_CURRENCY = 'TRY';

// Kullanıcıların elle girebileceği yaygın takma adlar resmî ISO koduna çevrilir.
const CURRENCY_ALIASES: Record<string, string> = {
  TL: 'TRY',
  TRL: 'TRY',
  '₺': 'TRY',
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
};

function normalizeCurrency(symbol: string): string {
  return CURRENCY_ALIASES[symbol] ?? symbol;
}

async function fetchYahooQuote(ticker: string): Promise<{ price: number; currency: string } | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
      headers: DEFAULT_HEADERS,
      cache: 'no-store',
    });
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    const currency = meta?.currency;
    if (typeof price === "number" && typeof currency === "string") {
      return { price, currency };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchYahooPrice(ticker: string): Promise<number | null> {
  const quote = await fetchYahooQuote(ticker);
  return quote?.price ?? null;
}

// Belirli bir tarihe kadarki (o tarih dahil) son kapanış fiyatını Yahoo'nun
// tarihsel grafik verisinden çeker. Hafta sonu/tatil günlerini tolere etmek
// için hedef tarihten 10 gün öncesine kadar bir pencere alıp en son kaydı seçer.
async function fetchYahooHistoricalQuote(ticker: string, date: string): Promise<{ price: number; currency: string } | null> {
  try {
    const period2 = Math.floor(new Date(`${date}T23:59:59Z`).getTime() / 1000);
    const period1 = period2 - 10 * 24 * 60 * 60;
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d`, {
      headers: DEFAULT_HEADERS,
      cache: 'no-store',
    });
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const currency = result?.meta?.currency;
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    if (typeof currency !== "string") return null;
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (timestamps[i] <= period2 && typeof closes[i] === "number") {
        return { price: closes[i] as number, currency };
      }
    }
    return null;
  } catch {
    return null;
  }
}


// Kur bütün varlıklar için aynı ama sayfa açılışında her varlık ayrı ayrı
// soruyordu — 22 varlık = 22 dış çağrı (her biri 0,75–2 sn). Süreç içinde
// paylaşılıyor ve eşzamanlı istekler tek çağrıya bindiriliyor.
const RATE_TTL_MS = 10 * 60 * 1000;

// Bir hisse sembolünün Yahoo'da hangi biçimde bulunduğunu çözer ve hatırlar.
const TICKER_TTL_MS = 24 * 60 * 60 * 1000;
const HISTORICAL_TTL_MS = 24 * 60 * 60 * 1000;

async function resolveStockTicker(symbol: string): Promise<string | null> {
  return cached(`ticker:${symbol}`, TICKER_TTL_MS, async () => {
    if (await fetchYahooQuote(symbol)) return symbol;
    if (!symbol.includes(".") && await fetchYahooQuote(`${symbol}.IS`)) return `${symbol}.IS`;
    return null;
  });
}

// Güncel ve geçmiş USD/TRY kuru AYNI kaynaktan (Frankfurter) geliyor;
// gerekçesi ve sınırları lib/fx.ts'te.
async function fetchUsdTryRate(date: string | null): Promise<number | null> {
  try {
    const res = await fetch(fxRateUrl(date, 'USD', 'TRY'), { cache: 'no-store' });
    return readRate(await res.json(), 'TRY');
  } catch {
    return null;
  }
}

// `shouldCache: rate => rate !== null` ŞART: aksi hâlde Frankfurter'a giden
// geçici bir aksaklık "kur yok" sonucunu TTL boyunca (geçmişte 24 saate kadar)
// dondurur ve her USD hesaplaması o süre boyunca sessizce 0'a düşer. Gerçekte
// yaşandı — kullanıcı "USD kuru sıfır geldi" diye bildirdi.
async function getUsdTryRate(): Promise<number | null> {
  return cached('usdtry:current', RATE_TTL_MS, () => fetchUsdTryRate(null), rate => rate !== null);
}

async function getHistoricalUsdTryRate(date: string): Promise<number | null> {
  // Geçmiş kur değişmez, üstelik aynı tarih tüm varlıklar için soruluyor.
  return cached(`usdtry:${date}`, HISTORICAL_TTL_MS, () => fetchUsdTryRate(date), rate => rate !== null);
}

// Herhangi bir para birimindeki tutarı hem TRY hem USD karşılığına çevirir.
// `date` verilirse o günün kuru, verilmezse en son yayınlanan kur kullanılır.
async function convertToTryAndUsd(amount: number, rawCurrency: string, usdTryRate: number | null, date: string | null): Promise<{ tryAmount: number | null; usdAmount: number | null }> {
  const currency = normalizeCurrency(rawCurrency);
  if (currency === BASE_CURRENCY) {
    return { tryAmount: amount, usdAmount: usdTryRate ? amount / usdTryRate : null };
  }
  if (currency === "USD") {
    return { tryAmount: usdTryRate ? amount * usdTryRate : null, usdAmount: amount };
  }
  try {
    const res = await fetch(fxRateUrl(date, currency, ['TRY', 'USD']), { cache: 'no-store' });
    const data = await res.json();
    const tryRate = readRate(data, 'TRY');
    const usdRate = readRate(data, 'USD');
    return {
      tryAmount: tryRate === null ? null : amount * tryRate,
      usdAmount: usdRate === null ? null : amount * usdRate,
    };
  } catch {
    return { tryAmount: null, usdAmount: null };
  }
}

type PriceResult = { price: number; priceUSD: number };

async function getCurrentPrice(symbol: string, type: string | null): Promise<PriceResult> {
  const usdTryRate = await getUsdTryRate();

  // 1. DÖVİZ
  if (type === "currency") {
    const { tryAmount, usdAmount } = await convertToTryAndUsd(1, symbol, usdTryRate, null);
    return { price: tryAmount ?? 0, priceUSD: usdAmount ?? 0 };
  }

  // 2. DEĞERLİ MADEN — Yahoo vadeli işlem fiyatları (USD/ons); sembol gram varyantıysa grama çevrilir
  if (type === "metal") {
    const spec = METAL_SPECS[symbol];
    if (!spec) return { price: 0, priceUSD: 0 };
    const ozPriceUSD = await fetchYahooPrice(spec.ticker);
    if (ozPriceUSD === null) return { price: 0, priceUSD: 0 };
    const priceUSD = spec.perGram ? ozPriceUSD / TROY_OUNCE_IN_GRAMS : ozPriceUSD;
    const priceTRY = usdTryRate !== null ? priceUSD * usdTryRate : null;
    return { price: priceTRY ?? 0, priceUSD };
  }

  // 3. FONLAR - TEFAS Doğrudan Erişim (şu an sadece TR fonları destekleniyor, her zaman TRY)
  if (type === "fund") {
    const tryPrice = await tefasLatestPrice(symbol);
    const usdPrice = tryPrice !== null && usdTryRate ? tryPrice / usdTryRate : null;
    return { price: tryPrice ?? 0, priceUSD: usdPrice ?? 0 };
  }

  // 4. HİSSE SENETLERİ (yerli + yabancı)
  // Arama sonuçlarından gelen semboller borsa sonekini zaten içerir (THYAO.IS, AAPL, vb.)
  // Manuel eklenmiş ve soneksiz bir BIST sembolü olabileceği ihtimaline karşı
  // ilk deneme başarısız olursa ".IS" ekleyerek bir kez daha deneriz.
  // Hangi sonekin çalıştığı bir kez öğrenilip hatırlanır; aksi hâlde her BIST
  // sembolü için önce soneksiz (başarısız) sonra ".IS" ile iki çağrı gidiyordu.
  const ticker = await resolveStockTicker(symbol);
  const quote = ticker ? await fetchYahooQuote(ticker) : null;
  if (quote === null) return { price: 0, priceUSD: 0 };
  const { tryAmount, usdAmount } = await convertToTryAndUsd(quote.price, quote.currency, usdTryRate, null);
  return { price: tryAmount ?? 0, priceUSD: usdAmount ?? 0 };
}

async function getHistoricalPrice(symbol: string, type: string | null, date: string): Promise<PriceResult> {
  const usdTryRate = await getHistoricalUsdTryRate(date);

  // 1. DÖVİZ
  if (type === "currency") {
    const { tryAmount, usdAmount } = await convertToTryAndUsd(1, symbol, usdTryRate, date);
    return { price: tryAmount ?? 0, priceUSD: usdAmount ?? 0 };
  }

  // 2. DEĞERLİ MADEN
  if (type === "metal") {
    const spec = METAL_SPECS[symbol];
    if (!spec) return { price: 0, priceUSD: 0 };
    const quote = await fetchYahooHistoricalQuote(spec.ticker, date);
    if (quote === null) return { price: 0, priceUSD: 0 };
    const priceUSD = spec.perGram ? quote.price / TROY_OUNCE_IN_GRAMS : quote.price;
    const priceTRY = usdTryRate !== null ? priceUSD * usdTryRate : null;
    return { price: priceTRY ?? 0, priceUSD };
  }

  // 3. FONLAR
  if (type === "fund") {
    const tryPrice = await tefasPriceOn(symbol, date);
    const usdPrice = tryPrice !== null && usdTryRate ? tryPrice / usdTryRate : null;
    return { price: tryPrice ?? 0, priceUSD: usdPrice ?? 0 };
  }

  // 4. HİSSE SENETLERİ
  const ticker = await resolveStockTicker(symbol);
  const quote = ticker ? await fetchYahooHistoricalQuote(ticker, date) : null;
  if (quote === null) return { price: 0, priceUSD: 0 };
  const { tryAmount, usdAmount } = await convertToTryAndUsd(quote.price, quote.currency, usdTryRate, date);
  return { price: tryAmount ?? 0, priceUSD: usdAmount ?? 0 };
}

const EMPTY: PriceResult = { price: 0, priceUSD: 0 };

async function priceFor(symbol: string, type: string | null, date: string | null): Promise<PriceResult> {
  try {
    return date ? await getHistoricalPrice(symbol, type, date) : await getCurrentPrice(symbol, type);
  } catch {
    return EMPTY;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date"); // YYYY-MM-DD, verilmezse güncel fiyat

  // TOPLU İSTEK: "SEMBOL:tip,SEMBOL:tip" biçiminde.
  // Sayfa açılışında her varlık için ayrı HTTP isteği atmak, tarayıcının aynı
  // sunucuya en fazla ~6 eşzamanlı bağlantı açması yüzünden istekleri kuyruğa
  // sokuyordu. Tek istekte toplanınca dış çağrılar sunucuda paralel yapılıyor.
  const batch = searchParams.get("symbols");
  if (batch) {
    const items = batch.split(",").map(part => {
      const [sym, t] = part.split(":");
      return { symbol: sym?.toUpperCase().trim() ?? "", type: t ?? null };
    }).filter(i => i.symbol);

    const results = await Promise.all(items.map(async i => [i.symbol, await priceFor(i.symbol, i.type, date)] as const));
    return NextResponse.json({ prices: Object.fromEntries(results) });
  }

  const symbol = searchParams.get("symbol")?.toUpperCase().trim();
  const type = searchParams.get("type");
  if (!symbol) return NextResponse.json(EMPTY);
  return NextResponse.json(await priceFor(symbol, type, date));
}
