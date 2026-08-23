import { NextResponse } from "next/server";
import { fxSeriesUrl } from "../../../lib/fx";
import { readCache, writeCache, purgeCache, hasRestatement } from "../../../lib/priceCache";
import { tefasSeries as tefasFetch, periodForRange } from "../../../lib/tefas";
import { coinGeckoRangeSeries } from "../../../lib/coingecko";
import { cached } from "../../../lib/ttlCache";

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

/**
 * Aynı seri için kaynağa en fazla bu sıklıkta gidilir (süreç içi).
 *
 * Veri günlük çözünürlükte (kapanış/NAV), yani gün içinde tekrar tekrar
 * çekmenin bilgi değeri yok. 6 saat = sembol başına günde en çok ~4 istek.
 * Sunucu yeniden başlayınca sıfırlanır; kalıcı katman price_history.
 */
const SOURCE_TTL_MS = 6 * 60 * 60 * 1000;

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


async function frankfurterSeries(from: string, start: string, end: string) {
  const res = await fetch(fxSeriesUrl(start, end, from, 'TRY'), { cache: 'no-store' });
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
    if (type === "fund") return await tefasFetch(symbol, periodForRange(start));

    // KRİPTO — bu dal HİÇ YOKTU: "ETH" gibi semboller sessizce aşağıdaki
    // hisse yoluna düşüp Yahoo'da "ETH" TİCKER'ı olarak aranıyordu — yani
    // Ethereum'un fiyatı değil, Yahoo'da o sembolle eşleşen BAŞKA BİR
    // enstrümanın (bir hisse senedi) fiyat serisi geliyordu. Tabloyla
    // (/api/price, doğru: "ETH-USD" paritesi) grafiğin (/api/history)
    // birbirini tutmaması buradan kaynaklanıyordu. CoinGecko birincil,
    // ücretsiz katmanın 365 günlük sınırı ya da coin bulunamazsa Yahoo'nun
    // DOĞRU "ETH-USD" paritesine düşülüyor — bare sembole değil.
    if (type === "crypto") {
      const cg = await coinGeckoRangeSeries(symbol, start, end);
      if (cg) return cg;
      return await yahooSeries(`${symbol}-USD`, start, end);
    }

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
    //
    // Kaynak çağrısı ayrıca SÜREÇ İÇİ TTL ile sarılıyor. price_history tablosu
    // son SETTLING_DAYS günü hiç yazmadığı için (fiyatlar oturmamış olabilir)
    // kaynağa gitmek tamamen atlanamaz — atlanırsa grafik 5 gün geriden biter.
    // Bunun yerine SONUÇ bellekte tutuluyor: TTL içindeki tekrar isteklerde
    // aynı taze seri ağdan değil bellekten dönüyor, seri yine güncel kalıyor.
    // Asıl kazanç TEFAS'ta: 82 sembolün 54'ü fon ve TEFAS'ın resmî API'si yok,
    // her sayfa açılışında 54 istek atmak engellenme riski taşıyor. cached()
    // ayrıca eşzamanlı aynı istekleri tek çağrıya bindiriyor.
    const [cachedRows, fresh] = await Promise.all([
      readCache(symbol, assetType, start, end),
      cached(
        `history:${symbol}:${assetType}:${start}:${end}`,
        SOURCE_TTL_MS,
        fetchFromSource,
        // Başarısızlığı önbellekleme: geçici bir kesinti TTL boyunca
        // dondurulmamalı (bkz. lib/ttlCache.ts'teki kur hatası notu).
        result => result !== null && Object.keys(result.prices).length > 0,
      ),
    ]);

    if (!fresh) {
      // Kaynak cevap vermedi ama elimizde önbellek varsa onu döndürmek,
      // boş grafik göstermekten iyidir.
      return { currency: cachedRows.currency ?? 'TRY', prices: cachedRows.prices, cached: true };
    }

    // Bölünme / bedelsiz / temettü düzeltmesi kontrolü: kaynak geçmişi geriye
    // dönük değiştirdiyse önbellek artık yanlış, atılır.
    const restated = hasRestatement(cachedRows.prices, fresh.prices);
    if (restated) await purgeCache(symbol, assetType);

    const merged: Record<string, number> = restated ? {} : { ...cachedRows.prices };
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
