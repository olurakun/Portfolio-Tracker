import { NextResponse } from "next/server";
import { getCurrentPrice, getHistoricalPrice, type PriceResult } from "../../../lib/priceFetch";
import { readQuotes, quoteKey, isFresh } from "../../../lib/quoteStore";

// Bu dosya artık yalnızca HTTP katmanı; fiyat mantığı lib/priceFetch.ts'te.

const EMPTY: PriceResult = { price: 0, priceUSD: 0 };

/**
 * Paylaşılan depodaki satır bu yaştan eskiyse canlı çekime düşülür.
 * Zamanlanmış iş gecikirse/durursa kullanıcı bayat fiyat görmesin diye —
 * depo bir hızlandırma, tek doğruluk kaynağı değil.
 */
const QUOTE_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Önce PAYLAŞILAN depo, bulunamayan/bayat olanlar için canlı çekim.
 * Aynı sembolü tutan farklı kullanıcılar tek çekimden faydalansın diye
 * (bkz. lib/quoteStore). Depo yoksa davranış eskisiyle birebir aynı.
 */
async function pricesFromStoreOrLive(
  items: { symbol: string; type: string | null }[],
): Promise<Record<string, PriceResult>> {
  const stored = await readQuotes(items.map(i => ({ symbol: i.symbol, assetType: i.type ?? 'stock' })));
  const out: Record<string, PriceResult> = {};
  const missing: typeof items = [];

  for (const item of items) {
    const hit = stored.get(quoteKey(item.symbol, item.type ?? 'stock'));
    if (hit && isFresh(hit.fetchedAt, QUOTE_MAX_AGE_MS)) {
      out[item.symbol] = { price: hit.price, priceUSD: hit.priceUSD };
    } else {
      missing.push(item);
    }
  }

  const fresh = await Promise.all(
    missing.map(async i => [i.symbol, await priceFor(i.symbol, i.type, null)] as const),
  );
  for (const [symbol, result] of fresh) out[symbol] = result;
  return out;
}

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

    // Geçmiş tarih sorgusu paylaşılan depoyu KULLANMAZ: depo yalnızca "en son
    // fiyat"ı tutuyor, tarihe göre anahtarlı değil (o iş lib/priceCache.ts'te).
    if (date) {
      const results = await Promise.all(items.map(async i => [i.symbol, await priceFor(i.symbol, i.type, date)] as const));
      return NextResponse.json({ prices: Object.fromEntries(results) });
    }
    return NextResponse.json({ prices: await pricesFromStoreOrLive(items) });
  }

  const symbol = searchParams.get("symbol")?.toUpperCase().trim();
  const type = searchParams.get("type");
  if (!symbol) return NextResponse.json(EMPTY);
  return NextResponse.json(await priceFor(symbol, type, date));
}
