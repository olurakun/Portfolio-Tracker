import { NextResponse } from "next/server";
import { readCache, writeCache, purgeCache, hasRestatement } from "../../../lib/priceCache";

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

type HistoryResult = { currency: string; prices: Record<string, number>; cached?: boolean; restated?: boolean };

async function seriesFor(symbolRaw: string, type: string | null, start: string, end: string): Promise<HistoryResult> {
  const symbol = symbolRaw.toUpperCase().trim();

  // Ana para birimi kendi cinsinden hep 1 eder; ne dış servise ne önbelleğe gerek var.
  if (type === "currency" && (CURRENCY_ALIASES[symbol] ?? symbol) === 'TRY') {
    return { currency: 'TRY', prices: { [start]: 1, [end]: 1 } };
  }

  const fetchFromSource = async () => {
    if (type === "currency") {
      return await frankfurterSeries(CURRENCY_ALIASES[symbol] ?? symbol, start, end);
    }
    if (type === "metal") {
      const spec = METAL_SPECS[symbol];
      if (!spec) return null;
      const s2 = await yahooSeries(spec.ticker, start, end);
      if (!s2) return null;
      if (spec.perGram) {
        for (const d of Object.keys(s2.prices)) s2.prices[d] /= TROY_OUNCE_IN_GRAMS;
      }
      return s2;
    }
    if (type === "fund") return await tefasSeries(symbol, start);

    let s2 = await yahooSeries(symbol, start, end);
    if ((!s2 || Object.keys(s2.prices).length === 0) && !symbol.includes(".")) {
      s2 = await yahooSeries(`${symbol}.IS`, start, end);
    }
    return s2;
  };

  try {
    const assetType = type ?? 'stock';

    // Önbellek okuma ve kaynak çekme PARALEL yapılır. Sıra ile yapıldığında
    // ikisinin gecikmesi toplanıyordu ve önbellek isteği hızlandırmak yerine
    // yavaşlatıyordu (0,47 sn → 0,85 sn). Paralelde maliyet yavaş olanın kadar.
    const [cached, fresh] = await Promise.all([
      readCache(symbol, assetType, start, end),
      fetchFromSource(),
    ]);

    if (!fresh) {
      // Kaynak cevap vermedi ama elimizde önbellek varsa onu döndürmek,
      // boş grafik göstermekten iyidir.
      return { currency: cached.currency ?? 'TRY', prices: cached.prices, cached: true };
    }

    // Bölünme / bedelsiz / temettü düzeltmesi kontrolü: kaynak geçmişi geriye
    // dönük değiştirdiyse önbellek artık yanlış, atılır.
    const restated = hasRestatement(cached.prices, fresh.prices);
    if (restated) await purgeCache(symbol, assetType);

    const merged: Record<string, number> = restated ? {} : { ...cached.prices };
    for (const [d, p] of Object.entries(fresh.prices)) merged[d] = p;

    // Yazma isteği yanıtı bekletmesin.
    void writeCache(symbol, assetType, fresh.currency, restated ? fresh.prices : merged);

    return { currency: fresh.currency, prices: merged, restated };
  } catch {
    return { currency: 'TRY', prices: {} };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return NextResponse.json({ currency: 'TRY', prices: {} });

  // TOPLU İSTEK: "SEMBOL:tip,SEMBOL:tip". Tarayıcı aynı sunucuya ~6 eşzamanlı
  // bağlantı açtığı için varlık başına ayrı istek kuyruk oluşturuyordu.
  const batch = searchParams.get("symbols");
  if (batch) {
    const items = batch.split(",").map(part => {
      const [sym, t] = part.split(":");
      return { symbol: sym ?? "", type: t ?? null };
    }).filter(i => i.symbol);

    const rows = await Promise.all(
      items.map(async i => [i.symbol.toUpperCase().trim(), await seriesFor(i.symbol, i.type, start, end)] as const)
    );
    return NextResponse.json({ series: Object.fromEntries(rows) });
  }

  const symbol = searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ currency: 'TRY', prices: {} });
  return NextResponse.json(await seriesFor(symbol, searchParams.get("type"), start, end));
}
