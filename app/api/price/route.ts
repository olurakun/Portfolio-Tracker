import { NextResponse } from "next/server";

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
};

async function fetchYahooPrice(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
      headers: DEFAULT_HEADERS,
      cache: 'no-store',
    });
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase().trim();
  const type = searchParams.get("type");

  if (!symbol) return NextResponse.json({ price: 0 });

  try {
    // 1. DÖVİZ (TRY karşılığı)
    if (type === "currency") {
      const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${symbol}`, { cache: 'no-store' });
      const data = await res.json();
      if (data?.rates?.TRY) return NextResponse.json({ price: parseFloat(data.rates.TRY) });
      return NextResponse.json({ price: 0 });
    }

    // 2. DEĞERLİ MADEN — Yahoo üzerinden doğrudan TRY karşılığı (XAUTRY=X, XAGTRY=X)
    if (type === "metal") {
      const price = await fetchYahooPrice(`${symbol}TRY=X`);
      return NextResponse.json({ price: price ?? 0 });
    }

    // 3. FONLAR - TEFAS Doğrudan Erişim (şu an sadece TR fonları destekleniyor)
    if (type === "fund") {
      const price = await fetchTefasPrice(symbol);
      return NextResponse.json({ price: price ?? 0 });
    }

    // 4. HİSSE SENETLERİ (yerli + yabancı)
    // Arama sonuçlarından gelen semboller borsa sonekini zaten içerir (THYAO.IS, AAPL, vb.)
    // Manuel eklenmiş ve soneksiz bir BIST sembolü olabileceği ihtimaline karşı
    // ilk deneme başarısız olursa ".IS" ekleyerek bir kez daha deneriz.
    let priceVal = await fetchYahooPrice(symbol);
    if (priceVal === null && !symbol.includes(".")) {
      priceVal = await fetchYahooPrice(`${symbol}.IS`);
    }
    return NextResponse.json({ price: priceVal ?? 0 });
  } catch (error) {
    return NextResponse.json({ price: 0 });
  }
}