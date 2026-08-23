import { createClient } from '@supabase/supabase-js';

/**
 * PAYLAŞILAN güncel fiyat deposu (`price_quotes` tablosu).
 *
 * Neden gerekli: `/api/price` şu an her sayfa yüklemesinde, her kullanıcının
 * kendi varlık listesi için sağlayıcıya ayrı ayrı gidiyor. 50 kullanıcı THYAO
 * tutuyorsa THYAO 50 kez çekiliyor. Kredi/kota SEMBOL başına sayıldığı için
 * (bkz. lib/twelvedata.ts) bu, ücretli bir katmanda doğrudan paraya dönüşen
 * bir israf.
 *
 * Bu depo tersini yapar: sembol evreni TÜM kullanıcıların birleşimi olarak bir
 * kez çekilir (app/api/cron/refresh-prices), herkes aynı satırdan okur.
 *
 * `lib/priceCache.ts` ile KARIŞTIRMA — o, tarihe göre anahtarlanmış GÜNLÜK
 * KAPANIŞ serisini tutuyor (grafik ve karşılaştırma için, TEFAS'ın 12 aylık
 * penceresi dışına düşen veriyi kurtarmak amacıyla). Burası sembol başına TEK
 * satır: en son fiyat. Farklı şekil, farklı ömür.
 *
 * LİSANS NOTU: Tek çekimi birden çok son kullanıcıya sunmanın Twelve Data
 * sözleşmesinde ayrıca izin gerektirip gerektirmediği HENÜZ TEYİT EDİLMEDİ
 * (şartlarda "üçüncü taraflara transfer" yasağı var ama kendi kullanıcılarını
 * kapsayıp kapsamadığı açık değil). Bu modül sağlayıcıdan bağımsız çalışır;
 * bugün Yahoo'yu besliyor. Teyit gelmeden Twelve Data'ya bağlanmamalı.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Yazma servis anahtarı ister: fiyat satırları kullanıcıya ait değil, ama
// anon role yazma açılırsa herkes fiyat zehirleyebilirdi.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const reader = url && anonKey ? createClient(url, anonKey) : null;
const writer = url && serviceKey ? createClient(url, serviceKey) : null;

export type StoredQuote = { price: number; priceUSD: number; fetchedAt: string };

/** Depoda bir satırı benzersiz kılan anahtar. */
export function quoteKey(symbol: string, assetType: string): string {
  return `${symbol.toUpperCase()}:${assetType}`;
}

/**
 * Satır hâlâ kullanılabilir mi. Saf fonksiyon — zamanlanmış iş gecikirse
 * `/api/price` bayat satırı sunmak yerine canlı çekime düşsün diye ayrı.
 */
export function isFresh(fetchedAt: string, maxAgeMs: number, now: Date = new Date()): boolean {
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return false;
  const age = now.getTime() - t;
  // Gelecek tarihli satır (saat kayması) bayat sayılmaz ama sonsuz taze de
  // olmamalı; negatif yaş 0 kabul ediliyor.
  return age <= maxAgeMs;
}

export async function readQuotes(
  keys: { symbol: string; assetType: string }[],
): Promise<Map<string, StoredQuote>> {
  const out = new Map<string, StoredQuote>();
  if (!reader || keys.length === 0) return out;
  try {
    const symbols = [...new Set(keys.map(k => k.symbol.toUpperCase()))];
    const { data, error } = await reader
      .from('price_quotes')
      .select('symbol, asset_type, price, price_usd, fetched_at')
      .in('symbol', symbols);

    // Tablo henüz oluşturulmadıysa sessizce önbelleksiz devam edilir
    // (lib/priceCache.ts'teki davranışın aynısı).
    if (error || !data) return out;

    for (const row of data) {
      const price = Number(row.price);
      const priceUSD = Number(row.price_usd);
      if (!Number.isFinite(price) || price <= 0) continue;
      out.set(quoteKey(row.symbol as string, row.asset_type as string), {
        price,
        priceUSD: Number.isFinite(priceUSD) ? priceUSD : 0,
        fetchedAt: row.fetched_at as string,
      });
    }
    return out;
  } catch {
    return out;
  }
}

export async function writeQuotes(
  rows: { symbol: string; assetType: string; price: number; priceUSD: number }[],
): Promise<number> {
  if (!writer || rows.length === 0) return 0;
  // Sıfır fiyat yazılmaz: portföyde sahte kayıp gibi görünür (aynı hata daha
  // önce kurda ve fon fiyatlarında yaşandı, bkz. lib/fx.ts).
  const valid = rows.filter(r => Number.isFinite(r.price) && r.price > 0);
  if (valid.length === 0) return 0;
  try {
    const now = new Date().toISOString();
    const { error } = await writer.from('price_quotes').upsert(
      valid.map(r => ({
        symbol: r.symbol.toUpperCase(),
        asset_type: r.assetType,
        price: r.price,
        price_usd: r.priceUSD,
        fetched_at: now,
      })),
      { onConflict: 'symbol,asset_type' },
    );
    return error ? 0 : valid.length;
  } catch {
    return 0;
  }
}

/**
 * Zamanlanmış işin çekeceği sembol evreni: TÜM kullanıcıların varlıklarının
 * birleşimi. `tracked_symbols` görünümünden okunur — görünüm yalnızca
 * (symbol, type) döndürür, user_id ya da adet/tutar İÇERMEZ, dolayısıyla
 * kimin neye sahip olduğu sızmaz (public_portfolio_shares ile aynı ilke).
 */
export async function trackedSymbols(): Promise<{ symbol: string; assetType: string }[]> {
  if (!reader) return [];
  try {
    const { data, error } = await reader.from('tracked_symbols').select('symbol, type');
    if (error || !data) return [];
    return data
      .filter(r => typeof r.symbol === 'string' && r.symbol.trim())
      .map(r => ({ symbol: (r.symbol as string).toUpperCase(), assetType: (r.type as string) || 'stock' }));
  } catch {
    return [];
  }
}
