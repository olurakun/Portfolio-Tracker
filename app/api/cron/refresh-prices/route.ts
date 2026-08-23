import { NextResponse } from "next/server";
import { trackedSymbols, writeQuotes } from "../../../../lib/quoteStore";
import { fetchCurrentPrice } from "../../../../lib/priceFetch";

/**
 * Zamanlanmış toplu fiyat yenileme.
 *
 * TÜM kullanıcıların varlıklarının BİRLEŞİMİNİ tek seferde çeker ve paylaşılan
 * `price_quotes` deposuna yazar; `/api/price` sonra oradan okur. Böylece aynı
 * sembolü tutan N kullanıcı için N değil 1 çekim yapılır — kota sembol başına
 * sayıldığı için ücretli katmanda doğrudan maliyet farkı (bkz. lib/quoteStore).
 *
 * HENÜZ OTOMATİK ÇALIŞMIYOR: bir zamanlayıcıya bağlanmadı (vercel.json'da cron
 * girdisi yok). Elle çağrılabilir. Twelve Data'nın paylaşılan önbelleğe izin
 * verip vermediği teyit edilmeden otomatiğe alınmamalı.
 *
 * Kaynak bugün Yahoo — sağlayıcı değişimi tek yerden, lib/priceFetch.ts'ten.
 *
 * ZAMANLAMA (vercel.json): günde bir, 22:00 UTC = 01:00 İstanbul. Cron
 * ifadeleri Vercel'de HER ZAMAN UTC. Bu saat kasıtlı: BIST 18:10 İstanbul'da
 * (15:10 UTC), ABD borsaları ~21:00 UTC'de kapanıyor, TEFAS fon fiyatlarını
 * akşam yayımlıyor — 22:00 UTC hepsinin ardında kalıyor.
 *
 * Hobby planda cron GÜNDE YALNIZCA BİR KEZ çalışabilir ve Vercel saati ±59 dk
 * kaydırabilir (yükü dağıtmak için). Bu portföy için sorun değil: 82 sembolün
 * 54'ü TEFAS fonu (NAV günde bir), BIST tarafı da gün sonu. Günlük tazelik
 * verinin kendi çözünürlüğüyle zaten örtüşüyor. Pro planda dakikalık sıklık
 * serbest; o zaman ifadeyi sıklaştırıp QUOTE_MAX_AGE_HOURS'u düşürmek yeterli.
 */

// Ölçüm: 82 sembol 5,5 sn (Yahoo, 20'lik gruplar). Vercel Hobby'de fonksiyon
// varsayılanı 10 sn — sembol sayısı büyürse sınıra dayanmasın diye açıkça
// yükseltiliyor (Hobby'de izin verilen tavan 60).
export const maxDuration = 60;

// Sağlayıcı hız sınırını aşmamak için aynı anda kaç sembol çekileceği.
// Twelve Data Venture giriş katmanı dakikada 610 kredi veriyor ve kredi SEMBOL
// başına sayılıyor; 20'lik gruplar hem Yahoo'yu hem de o sınırı rahat bırakır.
const BATCH_SIZE = 20;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Sır tanımlı değilse uç tamamen kapalı — kazara herkese açık kalmasın.
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'yetkisiz' }, { status: 401 });
  }

  const symbols = await trackedSymbols();
  if (symbols.length === 0) {
    return NextResponse.json({ symbols: 0, written: 0, note: 'tracked_symbols boş ya da görünüm yok' });
  }

  let written = 0;
  const failed: string[] = [];

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const slice = symbols.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(slice.map(async s => {
      const quote = await fetchCurrentPrice(s.symbol, s.assetType);
      if (quote === null || quote.price <= 0) { failed.push(s.symbol); return null; }
      return { symbol: s.symbol, assetType: s.assetType, price: quote.price, priceUSD: quote.priceUSD };
    }));
    written += await writeQuotes(results.filter(r => r !== null));
  }

  return NextResponse.json({ symbols: symbols.length, written, failed });
}
