export type SortKey = 'symbol' | 'totalQty' | 'currentPrice' | 'value' | 'unrealizedPL' | 'realizedPL';
export type SortDir = 'asc' | 'desc';

/**
 * Portföy tablosunun sıralaması.
 *
 * Sembol alfabetik, diğerleri sayısal sıralanır. Alfabetik sıralamada Türkçe
 * karşılaştırma kullanılır: varsayılan sıralama "Ç" ve "Ö" gibi harfleri
 * alfabenin sonuna atar, oysa Türkçede C ve O'dan hemen sonra gelirler.
 *
 * Girdi dizisi değiştirilmez.
 */
export function sortPositions<T extends Record<string, any>>(
  rows: T[],
  key: SortKey,
  dir: SortDir,
): T[] {
  return [...rows].sort((a, b) => {
    const cmp = key === 'symbol'
      ? String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'tr')
      : (Number(a[key]) || 0) - (Number(b[key]) || 0);
    return dir === 'asc' ? cmp : -cmp;
  });
}

/**
 * Bir sütun başlığına tıklandığında yeni sıralama durumunu verir.
 * Aynı sütuna tekrar tıklamak yönü çevirir; yeni bir sütunda sayısal alanlar
 * büyükten küçüğe, sembol A'dan Z'ye başlar.
 */
export function nextSortState(
  current: { key: SortKey; dir: SortDir },
  clicked: SortKey,
): { key: SortKey; dir: SortDir } {
  if (current.key === clicked) {
    return { key: clicked, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: clicked, dir: clicked === 'symbol' ? 'asc' : 'desc' };
}
