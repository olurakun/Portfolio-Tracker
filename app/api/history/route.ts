import { NextResponse } from "next/server";
import { readCache, writeCache, purgeCache, hasRestatement, missingFrom, cacheCutoff } from "../../../lib/priceCache";

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

  // Ana para birimi kendi cinsinden hep 1 eder; ne dış servise ne önbelleğe gerek var.
  if (type === "currency" && (CURRENCY_ALIASES[symbol] ?? symbol) === 'TRY') {
    return NextResponse.json({ currency: 'TRY', prices: { [start]: 1, [end]: 1 }, flat: 1 });
  }

  // Kaynaktan veri çeker. `from` verilirse yalnızca o tarihten sonrası istenir —
  // önbellek eskiyi zaten kapsıyorsa kaynağa küçük bir pencere sorulur.
  const fetchFromSource = async (from: string) => {
    if (type === "currency") {
      const code = CURRENCY_ALIASES[symbol] ?? symbol;
      return await frankfurterSeries(code, from, end);
    }
    if (type === "metal") {
      const spec = METAL_SPECS[symbol];
      if (!spec) return null;
      const s = await yahooSeries(spec.ticker, from, end);
      if (!s) return null;
      if (spec.perGram) {
        for (const d of Object.keys(s.prices)) s.prices[d] /= TROY_OUNCE_IN_GRAMS;
      }
      return s;
    }
    if (type === "fund") {
      return await tefasSeries(symbol, from);
    }
    let s = await yahooSeries(symbol, from, end);
    if ((!s || Object.keys(s.prices).length === 0) && !symbol.includes(".")) {
      s = await yahooSeries(`${symbol}.IS`, from, end);
    }
    return s;
  };

  try {
    const assetType = type ?? 'stock';
    const cached = await readCache(symbol, assetType, start, end);
    const cutoff = cacheCutoff();

    // Önbellek aralığın başını kapsıyorsa kaynaktan sadece eksik kısım istenir.
    // Kapsamıyorsa (veya hiç yoksa) tamamı çekilir.
    const from = missingFrom(cached.prices, start, cutoff) ?? start;
    const fresh = await fetchFromSource(from);

    if (!fresh) {
      // Kaynak cevap vermedi ama elimizde önbellek varsa onu döndürmek,
      // boş grafik göstermekten iyidir.
      return NextResponse.json({
        currency: cached.currency ?? 'TRY',
        prices: cached.prices,
        cached: true,
      });
    }

    // Bölünme / bedelsiz / temettü düzeltmesi kontrolü: kaynak geçmişi geriye
    // dönük değiştirdiyse önbellek artık yanlış, atılır.
    const restated = hasRestatement(cached.prices, fresh.prices);
    if (restated) {
      await purgeCache(symbol, assetType);
    }

    const merged: Record<string, number> = restated ? {} : { ...cached.prices };
    for (const [d, p] of Object.entries(fresh.prices)) merged[d] = p;

    // Yazma isteği yanıtı bekletmesin.
    void writeCache(symbol, assetType, fresh.currency, restated ? fresh.prices : merged);

    return NextResponse.json({ currency: fresh.currency, prices: merged, restated });
  } catch {
    return NextResponse.json({ currency: 'TRY', prices: {} });
  }
}
