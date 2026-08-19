import { createClient } from '@supabase/supabase-js';
import type { PriceSeries } from './compare';

// Fiyat önbelleği. Sunucu tarafında çalışır ve fiyatları price_history
// tablosunda biriktirir.
//
// Neden gerekli: TEFAS en fazla 12 aylık geçmiş veriyor. Bugün kaydetmezsek
// bir yıldan eski fon fiyatları kalıcı olarak erişilemez hâle geliyor —
// önbelleğin asıl amacı hız değil, geri getirilemeyecek veriyi biriktirmek.
//
// ÖNEMLİ: Bu bir önbellek, kaynak değil. Bölünme (split) veya bedelsiz
// sermaye artırımı olduğunda kaynak geçmiş serinin tamamını geriye dönük
// düzeltir; bu yüzden her çekimde çakışan günler karşılaştırılıp uyuşmazlık
// varsa o sembolün önbelleği atılır.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const db = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * Son günlerin fiyatı henüz oturmamış olabilir (kapanış düzeltmeleri, geç
 * açıklanan fon fiyatları). Bu pencere içindeki günler önbelleğe yazılmaz,
 * her seferinde kaynaktan taze çekilir.
 */
export const SETTLING_DAYS = 5;

/** Önbelleğe yazılabilecek en son tarih. */
export function cacheCutoff(today = new Date()): string {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - SETTLING_DAYS);
  return d.toISOString().slice(0, 10);
}

/**
 * Kaynak ile önbellek arasında geriye dönük düzeltme olup olmadığını anlar.
 * Çakışan günlerde binde 5'ten fazla sapma varsa seri yeniden fiyatlanmış
 * demektir (bölünme, bedelsiz, temettü düzeltmesi).
 */
export function hasRestatement(cached: PriceSeries, fresh: PriceSeries): boolean {
  for (const [date, cachedPrice] of Object.entries(cached)) {
    const freshPrice = fresh[date];
    if (freshPrice === undefined || cachedPrice <= 0) continue;
    if (Math.abs(freshPrice - cachedPrice) / cachedPrice > 0.005) return true;
  }
  // Çakışan gün yoksa karşılaştıracak bir şey de yok; düzeltme varsayılmaz.
  return false;
}

export async function readCache(
  symbol: string, assetType: string, start: string, end: string,
): Promise<{ prices: PriceSeries; currency: string | null }> {
  if (!db) return { prices: {}, currency: null };
  try {
    const { data, error } = await db
      .from('price_history')
      .select('date, price, currency')
      .eq('symbol', symbol)
      .eq('asset_type', assetType)
      .gte('date', start)
      .lte('date', end);

    // Tablo henüz oluşturulmadıysa sessizce önbelleksiz devam edilir.
    if (error || !data) return { prices: {}, currency: null };

    const prices: PriceSeries = {};
    let currency: string | null = null;
    for (const row of data) {
      const p = Number(row.price);
      if (Number.isFinite(p) && p > 0) prices[row.date as string] = p;
      currency = currency ?? (row.currency as string);
    }
    return { prices, currency };
  } catch {
    return { prices: {}, currency: null };
  }
}

export async function writeCache(
  symbol: string, assetType: string, currency: string, prices: PriceSeries,
): Promise<void> {
  if (!db) return;
  const cutoff = cacheCutoff();
  const rows = Object.entries(prices)
    .filter(([date, price]) => date <= cutoff && price > 0)
    .map(([date, price]) => ({ symbol, asset_type: assetType, date, price, currency }));

  if (rows.length === 0) return;
  try {
    // Aynı gün tekrar yazılabilir; çakışmada üzerine yazılır.
    await db.from('price_history').upsert(rows, { onConflict: 'symbol,asset_type,date' });
  } catch {
    // Önbellek yazılamazsa uygulama çalışmaya devam etmeli.
  }
}

export async function purgeCache(symbol: string, assetType: string): Promise<void> {
  if (!db) return;
  try {
    await db.from('price_history').delete().eq('symbol', symbol).eq('asset_type', assetType);
  } catch {
    // yoksay
  }
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
