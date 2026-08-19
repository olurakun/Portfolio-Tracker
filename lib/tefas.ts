import { createLimiter, withRetry } from './limit';

/**
 * TEFAS fon fiyat erişimi. Tek yerde toplandı çünkü hem güncel fiyat hem
 * geçmiş seri route'ları aynı ucu kullanıyor ve eşzamanlılık sınırının
 * İKİSİ İÇİN BİRDEN geçerli olması gerekiyor — ayrı sınırlayıcılar sorunu
 * çözmezdi, sayfa açılışında ikisi aynı anda çağrılıyor.
 *
 * TEFAS'ın `periyod` parametresi keyfi bir sayı değil, sabit bir enum:
 * yalnızca 1, 3, 6 ve 12 kabul ediliyor; başka değerler "Sistem Hatası!!" veriyor.
 */

// Ölçüm: 7 eşzamanlı istek sorunsuz, 14'te yarısı düşüyor. 4 güvenli bir taban.
const limit = createLimiter(4);

export const VALID_PERIODS = [1, 3, 6, 12] as const;

/** İstenen tarihi kapsayan en küçük geçerli periyodu seçer. */
export function periodForRange(start: string, now = new Date()): number {
  const target = new Date(`${start}T00:00:00Z`);
  const months =
    (now.getUTCFullYear() - target.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - target.getUTCMonth()) + 1;
  return VALID_PERIODS.find(p => p >= months) ?? 12;
}

export type TefasSeries = { currency: 'TRY'; prices: Record<string, number> };

async function requestOnce(fundCode: string, periyod: number): Promise<TefasSeries | null> {
  try {
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
      // Fiyatı henüz açıklanmamış günler 0 olarak geliyor; bunlar atlanır.
      if (typeof e?.fiyat === "number" && e.fiyat > 0 && e.tarih) prices[e.tarih] = e.fiyat;
    }
    return { currency: 'TRY', prices };
  } catch {
    return null;
  }
}

/** Fon fiyat serisi. Eşzamanlılık sınırlı ve geçici hatalarda yeniden denenir. */
export async function tefasSeries(fundCode: string, periyod: number): Promise<TefasSeries | null> {
  return limit(() =>
    withRetry(
      () => requestOnce(fundCode, periyod),
      result => result === null || Object.keys(result.prices).length === 0,
    )
  );
}

/** Bir fonun bilinen en güncel fiyatı. */
export async function tefasLatestPrice(fundCode: string): Promise<number | null> {
  const series = await tefasSeries(fundCode, 1);
  if (!series) return null;
  const dates = Object.keys(series.prices).sort();
  return dates.length > 0 ? series.prices[dates[dates.length - 1]] : null;
}

/** Belirli bir tarihe kadarki (o tarih dahil) son geçerli fiyat. */
export async function tefasPriceOn(fundCode: string, date: string): Promise<number | null> {
  const series = await tefasSeries(fundCode, periodForRange(date));
  if (!series) return null;
  // Sözlük sırası tarih sırası değildir; karşılaştırmadan önce sıralanır.
  let best: number | null = null;
  for (const d of Object.keys(series.prices).sort()) {
    if (d <= date) best = series.prices[d];
  }
  return best;
}
