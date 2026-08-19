import { fold } from './turkish';

// Aracı kurum (portföyün hangi kurumda tutulduğu).
//
// Bilgi VARLIKTA değil İŞLEMDE tutuluyor: "bu 100 THYAO'yu Midas'tan aldım"
// bir işlem gerçeği. Varlığa bağlansaydı aynı sembolü iki kurumda tutmak
// imkânsız olurdu — kullanıcı bunun olabileceğini söyledi.

/** Aracı belirtilmemiş işlemler için gruplama anahtarı. */
export const UNASSIGNED = '';
export const UNASSIGNED_LABEL = 'Belirtilmemiş';

/**
 * Serbest metin girildiği için normalleştirme şart: "midas ", "Midas" ve
 * "MIDAS" aynı kurumdur, ayrı gruplara düşerlerse kırılım anlamsızlaşır.
 * Görünen yazım kullanıcının yazdığı gibi kalır, yalnızca eşleştirme
 * büyük/küçük harf ve boşluk duyarsızdır.
 */
export function normalizeBroker(value: unknown): string {
  if (typeof value !== 'string') return UNASSIGNED;
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Eşleştirme anahtarı. Türkçe küçültme BURADA KULLANILAMAZ: 'MIDAS'.toLowerCase()
 * Türkçe locale'de "mıdas" verir, 'Midas' ise "midas" — aynı kurum iki ayrı
 * gruba düşerdi. Bunun yerine harfler ASCII'ye katlanıyor (bkz. lib/turkish.ts).
 */
export function brokerKey(value: unknown): string {
  return fold(normalizeBroker(value));
}

type HasBroker = { broker?: string | null };

/**
 * İşlemlerde geçen aracı kurumların listesi. Aynı kurumun farklı yazımları
 * teke iner; ilk görülen yazım korunur. Belirtilmemiş varsa EN SONA konur —
 * kullanıcı önce gerçek kurumlarını görmeli.
 */
export function brokersOf(transactions: HasBroker[]): string[] {
  const byKey = new Map<string, string>();
  let hasUnassigned = false;

  for (const tx of transactions) {
    const name = normalizeBroker(tx.broker);
    if (!name) { hasUnassigned = true; continue; }
    const key = brokerKey(name);
    if (!byKey.has(key)) byKey.set(key, name);
  }

  const names = [...byKey.values()].sort((a, b) => a.localeCompare(b, 'tr'));
  return hasUnassigned ? [...names, UNASSIGNED] : names;
}

/** Bir aracıya ait işlemler. `null` filtre "hepsi" demektir. */
export function filterByBroker<T extends HasBroker>(transactions: T[], broker: string | null): T[] {
  if (broker === null) return transactions;
  const wanted = brokerKey(broker);
  return transactions.filter(tx => brokerKey(tx.broker) === wanted);
}

/** Ekranda gösterilecek ad. */
export function brokerLabel(broker: string): string {
  return normalizeBroker(broker) || UNASSIGNED_LABEL;
}
