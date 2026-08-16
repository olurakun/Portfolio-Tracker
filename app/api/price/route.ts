import { NextResponse } from "next/server";

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
};

const TROY_OUNCE_IN_GRAMS = 31.1034768;

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

// TEFAS'ın gerçek (dokümante olmayan ama doğrulanmış) fon fiyat endpoint'i.
// Kimlik doğrulaması gerektirmiyor; periyod=1 son ~1 aylık günlük fiyatları
// döndürür, en güncel fiyat listenin son elemanı.
async function fetchTefasPrice(fundCode: string): Promise<number | null> {
  try {
    const res = await fetch("https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ fonKodu: fundCode, dil: 'TR', periyod: 1 }),
      cache: 'no-store',
    });
    const data = await res.json();
    const list = data?.resultList;
    if (Array.isArray(list) && list.length > 0) {
      const latest = list[list.length - 1];
      return typeof latest.fiyat === "number" ? latest.fiyat : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function getUsdTryRate(): Promise<number | null> {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', { cache: 'no-store' });
    const data = await res.json();
    const rate = data?.rates?.TRY;
    return typeof rate === "number" ? rate : null;
  } catch {
    return null;
  }
}

// Herhangi bir para birimindeki tutarı hem TRY hem USD karşılığına çevirir.
async function convertToTryAndUsd(amount: number, currency: string, usdTryRate: number | null): Promise<{ tryAmount: number | null; usdAmount: number | null }> {
  if (currency === "TRY") {
    return { tryAmount: amount, usdAmount: usdTryRate ? amount / usdTryRate : null };
  }
  if (currency === "USD") {
    return { tryAmount: usdTryRate ? amount * usdTryRate : null, usdAmount: amount };
  }
  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${currency}`, { cache: 'no-store' });
    const data = await res.json();
    const tryRate = data?.rates?.TRY;
    const usdRate = data?.rates?.USD;
    return {
      tryAmount: typeof tryRate === "number" ? amount * tryRate : null,
      usdAmount: typeof usdRate === "number" ? amount * usdRate : null,
    };
  } catch {
    return { tryAmount: null, usdAmount: null };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase().trim();
  const type = searchParams.get("type");

  if (!symbol) return NextResponse.json({ price: 0, priceUSD: 0 });

  try {
    const usdTryRate = await getUsdTryRate();

    // 1. DÖVİZ
    if (type === "currency") {
      if (symbol === "USD") {
        return NextResponse.json({ price: usdTryRate ?? 0, priceUSD: 1 });
      }
      const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${symbol}`, { cache: 'no-store' });
      const data = await res.json();
      const tryPrice = data?.rates?.TRY;
      const usdPrice = data?.rates?.USD;
      return NextResponse.json({
        price: typeof tryPrice === "number" ? tryPrice : 0,
        priceUSD: typeof usdPrice === "number" ? usdPrice : 0,
      });
    }

    // 2. DEĞERLİ MADEN — Yahoo vadeli işlem fiyatları (USD/ons) gram'a çevrilip TRY karşılığı hesaplanır
    if (type === "metal") {
      const futuresTicker = symbol === "XAU" ? "GC=F" : symbol === "XAG" ? "SI=F" : null;
      if (!futuresTicker) return NextResponse.json({ price: 0, priceUSD: 0 });
      const ozPriceUSD = await fetchYahooPrice(futuresTicker);
      const gramPriceUSD = ozPriceUSD !== null ? ozPriceUSD / TROY_OUNCE_IN_GRAMS : null;
      const gramPriceTRY = gramPriceUSD !== null && usdTryRate !== null ? gramPriceUSD * usdTryRate : null;
      return NextResponse.json({ price: gramPriceTRY ?? 0, priceUSD: gramPriceUSD ?? 0 });
    }

    // 3. FONLAR - TEFAS Doğrudan Erişim (şu an sadece TR fonları destekleniyor, her zaman TRY)
    if (type === "fund") {
      const tryPrice = await fetchTefasPrice(symbol);
      const usdPrice = tryPrice !== null && usdTryRate ? tryPrice / usdTryRate : null;
      return NextResponse.json({ price: tryPrice ?? 0, priceUSD: usdPrice ?? 0 });
    }

    // 4. HİSSE SENETLERİ (yerli + yabancı)
    // Arama sonuçlarından gelen semboller borsa sonekini zaten içerir (THYAO.IS, AAPL, vb.)
    // Manuel eklenmiş ve soneksiz bir BIST sembolü olabileceği ihtimaline karşı
    // ilk deneme başarısız olursa ".IS" ekleyerek bir kez daha deneriz.
    let quote = await fetchYahooQuote(symbol);
    if (quote === null && !symbol.includes(".")) {
      quote = await fetchYahooQuote(`${symbol}.IS`);
    }
    if (quote === null) return NextResponse.json({ price: 0, priceUSD: 0 });
    const { tryAmount, usdAmount } = await convertToTryAndUsd(quote.price, quote.currency, usdTryRate);
    return NextResponse.json({ price: tryAmount ?? 0, priceUSD: usdAmount ?? 0 });
  } catch (error) {
    return NextResponse.json({ price: 0, priceUSD: 0 });
  }
}
