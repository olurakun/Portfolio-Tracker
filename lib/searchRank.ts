// Arama sonuçlarının birleştirilmesi ve sıralanması.
//
// Ayrı bir modülde çünkü buradaki kural bir kez sessizce bozulduğunda kullanıcı
// aradığı hisseyi hiç bulamıyor: "INFO" araması Yahoo'da Amerikan fonlarını ve
// içinde "information" geçen her şeyi döndürüyor, Info Yatırım (INFO.IS) listeye
// hiç girmiyordu.

export type SearchResult = { symbol: string; name: string; type: string };

/** Sembolün borsa soneki atılmış hâli: "INFO.IS" → "INFO". */
export function baseSymbol(symbol: string): string {
  return symbol.split('.')[0].toUpperCase();
}

/**
 * Sorgu bir borsa kodu gibi mi duruyor? Öyleyse ".IS" ile ikinci bir arama
 * yapmaya değer. Rakam veya boşluk içeren sorgular (şirket adı aramaları)
 * bunun dışında kalır.
 */
export function isTickerLike(query: string): boolean {
  return /^[A-Za-z]{2,6}$/.test(query.trim());
}

/**
 * BIST sonuçlarını genel sonuçların önüne alır, tekrarları eler ve sorguyla
 * birebir eşleşen sembolleri üste taşır.
 *
 * Sıralama KARARLI: eşit puanlı kayıtlar Yahoo'nun alaka sırasını korur —
 * kendi ölçütümüz olmadığı yerde onunkini bozmanın anlamı yok.
 */
export function mergeAndRank(
  bist: SearchResult[],
  general: SearchResult[],
  query: string,
): SearchResult[] {
  const merged: SearchResult[] = [];
  const seen = new Set<string>();
  for (const r of [...bist, ...general]) {
    const key = r.symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }

  const q = query.trim().toUpperCase();
  return merged
    .map((r, i) => ({ r, i, exact: baseSymbol(r.symbol) === q ? 0 : 1 }))
    .sort((a, b) => a.exact - b.exact || a.i - b.i)
    .map(x => x.r);
}
