import { NextResponse } from "next/server";

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
};

const TROY_OUNCE_IN_GRAMS = 31.1034768;

const METAL_SPECS: Record<string, { ticker: string; perGram: boolean }> = {
  XAU: { ticker: 'GC=F', perGram: true },
  XAG: { ticker: 'SI=F', perGram: true },
  XAUOZ: { ticker: 'GC=F', perGram: false },
  XAGOZ: { ticker: 'SI=F', perGram: false },
};

const CURRENCY_ALIASES: Record<string, string> = {
  TL: 'TRY', TRL: 'TRY', '₺': 'TRY', '$': 'USD', '€': 'EUR', '£': 'GBP',
};

// Bir varlığın tarih aralığındaki tüm günlük fiyat serisini TEK çağrıda döndürür.
// Grafik için tarih başına ayrı istek atmak (N varlık × M gün) sürdürülemezdi;
// her kaynak zaten seri döndürebildiği için varlık başına tek istek yetiyor.
// Fiyatlar kendi para biriminde döner, çeviriyi istemci kendi kur tablosuyla yapar.

async function yahooSeries(ticker: string, start: string, end: string) {
  const period1 = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${end}T23:59:59Z`).getTime() / 1000);
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d`,
    { headers: DEFAULT_HEADERS, cache: 'no-store' }
  );
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;
  const currency: string = result.meta?.currency ?? 'USD';
  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const prices: Record<string, number> = {};
  timestamps.forEach((t, i) => {
    const c = closes[i];
    if (typeof c === "number" && c > 0) {
      prices[new Date(t * 1000).toISOString().slice(0, 10)] = c;
    }
  });
  return { currency, prices };
}

async function tefasSeries(fundCode: string, start: string) {
  const target = new Date(`${start}T00:00:00Z`);
  const now = new Date();
  const monthsNeeded = (now.getFullYear() - target.getFullYear()) * 12 + (now.getMonth() - target.getMonth()) + 1;
  const periyod = [1, 3, 6, 12].find(p => p >= monthsNeeded) ?? 12;
  const res = await fetch("https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ fonKodu: fundCode, dil: 'TR', periyod }),
    cache: 'no-store',
  });
  const data = await res.json();
  const list = data?.resultList;
  if (!Array.isArray(list)) return null;
  const prices: Record<string, number> = {};
  for (const e of list) {
    if (typeof e?.fiyat === "number" && e.fiyat > 0 && e.tarih) prices[e.tarih] = e.fiyat;
  }
  return { currency: 'TRY', prices };
}

async function frankfurterSeries(from: string, start: string, end: string) {
  const res = await fetch(`https://api.frankfurter.dev/v1/${start}..${end}?from=${from}&to=TRY`, { cache: 'no-store' });
  const data = await res.json();
  const raw = data?.rates ?? {};
  const prices: Record<string, number> = {};
  for (const [date, value] of Object.entries(raw)) {
    const rate = (value as { TRY?: unknown })?.TRY;
    if (typeof rate === "number") prices[date] = rate;
  }
  return { currency: 'TRY', prices };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase().trim();
  const type = searchParams.get("type");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!symbol || !start || !end) {
    return NextResponse.json({ currency: 'TRY', prices: {} });
  }

  try {
    if (type === "currency") {
      const code = CURRENCY_ALIASES[symbol] ?? symbol;
      // Ana para birimi kendi cinsinden hep 1 eder; dış servise sormaya gerek yok.
      if (code === 'TRY') return NextResponse.json({ currency: 'TRY', prices: { [start]: 1, [end]: 1 }, flat: 1 });
      return NextResponse.json(await frankfurterSeries(code, start, end) ?? { currency: 'TRY', prices: {} });
    }

    if (type === "metal") {
      const spec = METAL_SPECS[symbol];
      if (!spec) return NextResponse.json({ currency: 'USD', prices: {} });
      const series = await yahooSeries(spec.ticker, start, end);
      if (!series) return NextResponse.json({ currency: 'USD', prices: {} });
      if (spec.perGram) {
        for (const d of Object.keys(series.prices)) series.prices[d] /= TROY_OUNCE_IN_GRAMS;
      }
      return NextResponse.json(series);
    }

    if (type === "fund") {
      return NextResponse.json(await tefasSeries(symbol, start) ?? { currency: 'TRY', prices: {} });
    }

    let series = await yahooSeries(symbol, start, end);
    if ((!series || Object.keys(series.prices).length === 0) && !symbol.includes(".")) {
      series = await yahooSeries(`${symbol}.IS`, start, end);
    }
    return NextResponse.json(series ?? { currency: 'TRY', prices: {} });
  } catch {
    return NextResponse.json({ currency: 'TRY', prices: {} });
  }
}
