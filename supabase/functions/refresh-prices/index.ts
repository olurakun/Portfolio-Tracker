/// <reference lib="deno.ns" />
// Zamanlanmış toplu fiyat yenileme — Supabase Edge Function (Deno).
//
// Vercel'de aynı işi yapan app/api/cron/refresh-prices/route.ts (Node) var,
// AMA uygulama henüz hiçbir yerde deploy edilmediği için o rotaya pg_net'in
// çağırabileceği bir URL yok. Bu yüzden mantık BURADA, Edge Function'ın
// içinde tekrar çalışıyor — kaynak kod tekrarı değil, üretilmiş kopya:
// ./_generated/*.ts dosyaları lib/*.ts'ten `npm run build:edge` ile
// üretiliyor (bkz. scripts/build-edge-function.mjs). Bu dosyaya DOKUNMAYIN,
// kaynağı düzenleyip betiği tekrar çalıştırın.
//
// Vercel'e deploy edildiğinde bu fonksiyonun görevi değişmeli: pg_cron'un
// hedefi Next.js API rotasına çevrilmeli, bu Edge Function ve _generated/
// klasörü kaldırılabilir — iki paralel zamanlayıcıya gerek kalmaz.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCurrentPrice } from './_generated/priceFetch.ts';

// Twelve Data Venture'da 610 kredi/dk; 20'lik gruplar hem onu hem Yahoo'yu
// rahat bırakır (app/api/cron/refresh-prices/route.ts ile aynı değer).
const BATCH_SIZE = 20;

/**
 * Çalışma sonucunu cron_runs tablosuna yazar.
 *
 * Kayıt YAZILAMAZSA iş başarısız SAYILMAZ: günlük tutmak fiyat yenilemenin
 * kendisinden daha az önemli, log yüzünden fiyatların güncellenmemesi
 * saçma olurdu. Bu yüzden hata yutuluyor (ama konsola düşüyor).
 */
async function logRun(
  db: ReturnType<typeof createClient>,
  row: { durationMs: number; symbols: number; written: number; failed: string[]; error?: string | null },
) {
  try {
    const { error } = await db.from('cron_runs').insert({
      job: 'refresh-prices',
      duration_ms: row.durationMs,
      symbols: row.symbols,
      written: row.written,
      // Uzun listeler satırı şişirmesin; sayı zaten symbols-written'dan çıkıyor.
      failed: row.failed.slice(0, 50),
      error: row.error ?? null,
    });
    if (error) console.error('cron_runs yazılamadı:', error.message);
  } catch (e) {
    console.error('cron_runs yazılamadı:', e);
  }
}

Deno.serve(async (req: Request) => {
  // Bu fonksiyona giriş, Supabase'in kendi Edge Function ağ geçidi
  // tarafından korunuyor: gelen istekte geçerli bir `apikey` yoksa buraya
  // hiç düşmüyor (bkz. supabase/refresh_prices_cron.sql — pg_cron isteği
  // Vault'taki service_role anahtarını o header'da taşıyor). Fonksiyon
  // İÇİNDEKİ veritabanı erişimi bundan bağımsız: aşağıda SUPABASE_SERVICE_
  // ROLE_KEY ortam değişkeninden ayrıca bir istemci kuruluyor.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tanımlı değil' }, { status: 500 });
  }
  // service_role: RLS'i atlar. tracked_symbols zaten herkese açık bir
  // görünüm olduğu için okuma için şart değildi, ama yazma (price_quotes)
  // için gerekiyor — ikisi için de aynı istemci kullanılıyor.
  const db = createClient(supabaseUrl, serviceKey);

  const { data: symbolRows, error: readError } = await db
    .from('tracked_symbols')
    .select('symbol, type');
  if (readError) {
    const message = `tracked_symbols okunamadı: ${readError.message}`;
    await logRun(db, { durationMs: Date.now() - startedAt, symbols: 0, written: 0, failed: [], error: message });
    return Response.json({ error: message }, { status: 500 });
  }

  const symbols = (symbolRows ?? [])
    .filter(r => typeof r.symbol === 'string' && r.symbol.trim())
    .map(r => ({ symbol: (r.symbol as string).toUpperCase(), assetType: (r.type as string) || 'stock' }));

  if (symbols.length === 0) {
    await logRun(db, { durationMs: Date.now() - startedAt, symbols: 0, written: 0, failed: [], error: 'tracked_symbols boş' });
    return Response.json({ symbols: 0, written: 0, note: 'tracked_symbols boş' });
  }

  let written = 0;
  const failed: string[] = [];

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const slice = symbols.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(slice.map(async s => {
      try {
        const quote = await getCurrentPrice(s.symbol, s.assetType);
        if (quote.price <= 0) { failed.push(s.symbol); return null; }
        return { symbol: s.symbol, asset_type: s.assetType, price: quote.price, price_usd: quote.priceUSD };
      } catch {
        failed.push(s.symbol);
        return null;
      }
    }));
    const rows = results.filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) {
      // fetched_at default now() — app/api/price/route.ts'teki isFresh
      // kontrolü bu değeri okuyor.
      const { error: writeError } = await db.from('price_quotes').upsert(rows, { onConflict: 'symbol,asset_type' });
      if (!writeError) written += rows.length;
    }
  }

  await logRun(db, {
    durationMs: Date.now() - startedAt,
    symbols: symbols.length,
    written,
    failed,
    // Hiçbir şey yazılamadıysa bu bir çalışma değil, sessiz bir arıza —
    // error alanına da geçsin ki tek bakışta görülsün.
    error: written === 0 ? 'hiçbir sembol yazılamadı' : null,
  });
  return Response.json({ symbols: symbols.length, written, failed });
});
