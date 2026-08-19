/**
 * Karşılaştırma ekranının hesapları.
 *
 * Farklı fiyat seviyelerindeki varlıklar (gram altın ~6.900 ₺, bir hisse ~200 ₺)
 * aynı eksende ham fiyatla gösterilemez. Bu yüzden her seri başlangıç tarihinde
 * 100'e endekslenir; çizgiler o andan itibaren yüzde getiriyi gösterir ve
 * varlıklar birbiriyle kıyaslanabilir hâle gelir.
 */

export type PriceSeries = Record<string, number>; // tarih → fiyat
export type IndexedPoint = { date: string; value: number };

/**
 * Fiyat serisi her günü içermez (hafta sonu, tatil, işlem görmeyen gün).
 * Verilen tarihe kadarki son bilinen fiyatı döndürür; hiç yoksa null.
 */
export function priceAsOf(series: PriceSeries, date: string): number | null {
  if (series[date] !== undefined) return series[date];
  let best: string | null = null;
  for (const d of Object.keys(series)) {
    if (d <= date && (best === null || d > best)) best = d;
  }
  return best === null ? null : series[best];
}

/**
 * Bir fiyat serisini, aralıktaki ilk geçerli fiyatı 100 kabul ederek endeksler.
 *
 * Başlangıç fiyatı bulunamayan (o tarihte henüz işlem görmeyen) seriler için
 * boş dizi döner — 100'e bölünecek bir taban olmadan endeks anlamsız olur.
 */
export function indexSeries(series: PriceSeries, dates: string[]): IndexedPoint[] {
  if (dates.length === 0) return [];

  // Aralık içinde hiç gerçek gözlem yoksa seri çizilmez. Aralık öncesindeki son
  // fiyattan doldurmak düz bir 100 çizgisi üretir ve bu "%0 getiri" iddiasıdır —
  // oysa elimizdeki tek bilgi o aralıkta veri olmadığı.
  const first = dates[0], last = dates[dates.length - 1];
  const hasObservation = Object.keys(series).some(d => d >= first && d <= last && series[d] > 0);
  if (!hasObservation) return [];

  let base: number | null = null;
  for (const d of dates) {
    const p = priceAsOf(series, d);
    if (p !== null && p > 0) { base = p; break; }
  }
  if (base === null) return [];

  const out: IndexedPoint[] = [];
  for (const d of dates) {
    const p = priceAsOf(series, d);
    if (p === null || p <= 0) continue;
    out.push({ date: d, value: (p / base) * 100 });
  }
  return out;
}

/** Endekslenmiş serinin toplam getirisi, yüzde olarak. */
export function totalReturnPct(points: IndexedPoint[]): number {
  if (points.length < 2) return 0;
  return points[points.length - 1].value - 100;
}

export type DailyValue = {
  date: string;
  /** Gün sonu toplam değer (TL). */
  value: number;
  /** O gün gruba giren net para (alım − satım, TL). */
  flow: number;
};

/**
 * Bir varlık grubunun zaman ağırlıklı getirisini 100'e endeksler.
 *
 * Grubun ham değerini endekslemek yanlış olur: dönem içinde gruba yeni alım
 * yapıldığında değer artar ama bu getiri değildir. Zaman ağırlıklı getiride
 * her günün getirisi nakit akışından arındırılır — (bugünün değeri − bugün
 * giren para) / dünün değeri — ve günlük getiriler zincirlenir. Böylece
 * "ne kadar para koydum" değil "koyduğum para nasıl performans gösterdi"
 * ölçülür ve gruplar birbiriyle âdil kıyaslanır.
 *
 * Grup boşken (değer 0) geçen günler atlanır; endeks ilk pozisyon açıldığı
 * günden başlar.
 */
export function timeWeightedIndex(days: DailyValue[]): IndexedPoint[] {
  const out: IndexedPoint[] = [];
  let cumulative = 100;
  let prevValue: number | null = null;

  for (const day of days) {
    if (prevValue === null || prevValue <= 0) {
      // Grup henüz boştu; bugün pozisyon varsa endeks buradan başlar.
      if (day.value > 0) {
        prevValue = day.value;
        out.push({ date: day.date, value: cumulative });
      }
      continue;
    }

    const growth = (day.value - day.flow) / prevValue;
    if (Number.isFinite(growth) && growth > 0) {
      cumulative *= growth;
      out.push({ date: day.date, value: cumulative });
    }
    prevValue = day.value > 0 ? day.value : prevValue;
  }

  return out;
}

/**
 * Aralıktaki hafta içi günlerin listesi. Piyasalar hafta sonu kapalı olduğu için
 * cumartesi/pazar atlanır — aksi hâlde grafikte düz basamaklar oluşur.
 */
export function businessDays(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
