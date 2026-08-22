// Döviz kuru adresleri — TEK kaynak: Frankfurter (Avrupa Merkez Bankası
// referans kurları, ücretsiz, anahtarsız, ticari kullanıma açık).
//
// Neden tek kaynak: önce güncel kur bir sağlayıcıdan, geçmiş kur başkasından
// geliyordu. Bugünün rakamıyla dünün rakamı farklı yerlerden gelince
// aralarında küçük ama açıklanamaz bir sıçrama oluşuyordu — bir portföyde
// "değer değişimi" olarak görünen şeyin bir kısmı gerçek değil, kaynak farkı
// olabilirdi. Ayrıca ikinci sağlayıcının ücretsiz katmanı atıf zorunlu
// tutuyordu; tek kaynağa inince o yükümlülük de ortadan kalktı.
//
// Sınır: ECB yaklaşık 30 büyük para birimi yayınlıyor (TRY, USD, EUR, GBP,
// JPY dahil). Listede olmayan bir para birimi için kur bulunamaz.

const BASE = 'https://api.frankfurter.dev/v1';

/**
 * Tek bir günün kuru. `date` null ise en son yayınlanan kur ("latest").
 * ECB kurları iş günlerinde yayınlandığı için hafta sonu ve tatillerde
 * "latest" son iş gününü verir.
 */
export function fxRateUrl(date: string | null, from: string, to: string | string[]): string {
  const targets = Array.isArray(to) ? to.join(',') : to;
  return `${BASE}/${date ?? 'latest'}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(targets)}`;
}

/** Tarih aralığının tamamı tek çağrıda (grafik ve maliyet hesabı için). */
export function fxSeriesUrl(start: string, end: string, from: string, to: string | string[]): string {
  const targets = Array.isArray(to) ? to.join(',') : to;
  return `${BASE}/${start}..${end}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(targets)}`;
}

/** Yanıttan tek bir kuru okur; sayı değilse null. */
export function readRate(payload: unknown, currency: string): number | null {
  const rate = (payload as { rates?: Record<string, unknown> } | null)?.rates?.[currency];
  return typeof rate === 'number' && Number.isFinite(rate) ? rate : null;
}
