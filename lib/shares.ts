// Portföy paylaşımı: seçilen varlık tipleri ve sütunlarla sınırlı, ANLIK
// GÖRÜNTÜ (snapshot) üreten saf fonksiyon.
//
// Canlı değil, bilinçli bir tercih: paylaşılan link kimlik doğrulaması
// gerektirmeyen bir uca hiçbir zaman canlı sorgu yapmaz. Görüntüleyen kişi
// paylaşım anında donmuş bir veriyi görür; sahibi "Yenile" derse güncellenir.
// Gerekçesi: RLS'siz, kimliksiz erişilebilen bir canlı fiyat ucu hem kötüye
// kullanılabilir bir yüzey açar hem de uygulamanın "giriş olmadan hiçbir
// veriye erişilemez" ilkesini deler.
//
// EN ÖNEMLİ KURAL: gizlenen bir sütun çıktı nesnesinde HİÇ YER ALMAMALI —
// arayüzde saklamak yetmez, ham JSON (veritabanı satırı) tarayıcı geliştirici
// araçlarından doğrudan okunabilir. Bu yüzden seçilmeyen alanlar objeye hiç
// yazılmıyor, undefined bile bırakılmıyor.

export type AssetType = 'stock' | 'fund' | 'currency' | 'metal' | 'crypto';

export type ShareColumns = {
  quantity: boolean;
  price: boolean;
  value: boolean;
  share: boolean;
  unrealizedPL: boolean;
  realizedPL: boolean;
};

export const DEFAULT_SHARE_COLUMNS: ShareColumns = {
  quantity: true,
  price: true,
  value: true,
  share: true,
  unrealizedPL: true,
  realizedPL: true,
};

export type ShareConfig = {
  /** null = tüm varlık tipleri dahil. */
  assetTypes: AssetType[] | null;
  columns: ShareColumns;
};

/** buildShareSnapshot'ın girdisi — PortfolioTable'ın PortfolioRow'uyla yapısal olarak uyumlu. */
export type ShareableRow = {
  symbol: string;
  type: string;
  totalQty: number;
  currentPrice: number;
  currentPriceUSD: number;
  value: number;
  valueUSD: number;
  unrealizedPL: number;
  unrealizedPLUSD: number;
  realizedPL: number;
  realizedPLUSD: number;
};

export type ShareRow = {
  symbol: string;
  type: string;
  quantity?: number;
  price?: number;
  priceUSD?: number;
  value?: number;
  valueUSD?: number;
  share?: number;
  unrealizedPL?: number;
  unrealizedPLUSD?: number;
  realizedPL?: number;
  realizedPLUSD?: number;
};

export type ShareTotals = {
  value?: number;
  valueUSD?: number;
  unrealizedPL?: number;
  unrealizedPLUSD?: number;
  realizedPL?: number;
  realizedPLUSD?: number;
};

export type ShareSnapshot = {
  rows: ShareRow[];
  totals: ShareTotals;
};

export function buildShareSnapshot(rows: ShareableRow[], config: ShareConfig): ShareSnapshot {
  const included = config.assetTypes
    ? rows.filter(r => (config.assetTypes as AssetType[]).includes(r.type as AssetType))
    : rows;

  // Yüzde her zaman GÖSTERİLEN alt küme içinde hesaplanır, tüm portföye göre
  // değil — böylece paylaşılmayan varlıkların toplam büyüklüğü dolaylı olarak
  // bile sızmaz. Kullanıcının kararı (2026-08-22): "sadece hisse portföyümü
  // paylaşırsam yüzdeler yalnızca hisseler arasındaki dağılımı göstersin."
  const subsetTotal = included.reduce((acc, r) => acc + r.value, 0);

  const cols = config.columns;

  const shareRows: ShareRow[] = included.map(r => {
    const row: ShareRow = { symbol: r.symbol, type: r.type };
    if (cols.quantity) row.quantity = r.totalQty;
    if (cols.price) { row.price = r.currentPrice; row.priceUSD = r.currentPriceUSD; }
    if (cols.value) { row.value = r.value; row.valueUSD = r.valueUSD; }
    if (cols.share) row.share = subsetTotal > 0 ? (r.value / subsetTotal) * 100 : 0;
    if (cols.unrealizedPL) { row.unrealizedPL = r.unrealizedPL; row.unrealizedPLUSD = r.unrealizedPLUSD; }
    if (cols.realizedPL) { row.realizedPL = r.realizedPL; row.realizedPLUSD = r.realizedPLUSD; }
    return row;
  });

  const totals: ShareTotals = {};
  if (cols.value) {
    totals.value = included.reduce((acc, r) => acc + r.value, 0);
    totals.valueUSD = included.reduce((acc, r) => acc + r.valueUSD, 0);
  }
  if (cols.unrealizedPL) {
    totals.unrealizedPL = included.reduce((acc, r) => acc + r.unrealizedPL, 0);
    totals.unrealizedPLUSD = included.reduce((acc, r) => acc + r.unrealizedPLUSD, 0);
  }
  if (cols.realizedPL) {
    totals.realizedPL = included.reduce((acc, r) => acc + r.realizedPL, 0);
    totals.realizedPLUSD = included.reduce((acc, r) => acc + r.realizedPLUSD, 0);
  }

  return { rows: shareRows, totals };
}
