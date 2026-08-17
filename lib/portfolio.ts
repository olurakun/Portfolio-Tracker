// Portföyün finansal matematiği. Arayüzden bağımsız ve saf tutuluyor ki
// test edilebilsin — yanlış hesaplanan bir kâr/zarar sessizce yanlış olur,
// bu yüzden buradaki her fonksiyonun testi var (lib/portfolio.test.ts).

export type TxType = 'buy' | 'sell' | 'dividend';

export type Transaction = {
  asset_id: string | number;
  type: TxType;
  quantity: number | string;
  price: number | string;
  date: string;
  /** Fiyatın para birimi. Verilmezse TRY varsayılır. */
  currency?: string | null;
};

/** Tarih (YYYY-MM-DD) → o günün USD/TRY kuru. */
export type FxRates = Record<string, number>;

export type ConvertedPrice = { tl: number; usd: number };

export type Position = {
  totalQty: number;
  totalCost: number;
  totalCostUSD: number;
  avgCost: number;
  realizedPL: number;
  realizedPLUSD: number;
};

const EPSILON = 1e-9;

/**
 * Verilen tarihteki USD/TRY kuru. Kur hafta sonu ve tatillerde yayınlanmadığı
 * için o tarihe kadarki son bilinen kura düşülür. Hiç önceki kayıt yoksa null.
 */
export function rateOn(date: string, fxRates: FxRates): number | null {
  if (!date) return null;
  if (fxRates[date] !== undefined) return fxRates[date];
  let best: string | null = null;
  for (const d of Object.keys(fxRates)) {
    if (d <= date && (best === null || d > best)) best = d;
  }
  return best === null ? null : fxRates[best];
}

/**
 * Bir işlemin birim fiyatını hem TL hem USD karşılığına çevirir.
 * Çeviri her zaman İŞLEM TARİHİNDEKİ kurla yapılır — bugünkü kurla değil —
 * çünkü TL bazlı maliyet "o gün gerçekte ne ödediğin"dir.
 * Desteklenmeyen para birimi için null döner (işlem hesaba katılmaz).
 */
export function convertTxPrice(tx: Transaction, fxRates: FxRates): ConvertedPrice | null {
  const price = Number(tx.price);
  if (!Number.isFinite(price)) return null;

  const currency = (tx.currency || 'TRY').toUpperCase();
  const rate = rateOn(tx.date, fxRates);

  if (currency === 'TRY') {
    return { tl: price, usd: rate ? price / rate : 0 };
  }
  if (currency === 'USD') {
    return { tl: rate ? price * rate : 0, usd: price };
  }
  return null;
}

/**
 * Tek bir varlığın pozisyonunu FIFO (ilk giren ilk çıkar) yöntemiyle hesaplar.
 *
 * FIFO tercih edildi çünkü aracı kurum ekstreleri (Midas) bu yöntemi kullanıyor;
 * ağırlıklı ortalamayla kısmi satış sonrası rakamlar ekstreyle tutmuyordu.
 *
 * Temettü adedi değiştirmez; tutarı gerçekleşmiş gelire eklenir.
 * Elde olandan fazla satış, eldeki kadarıyla sınırlanır (adet negatife düşmez).
 *
 * İşlemler tarih sırasına göre verilmelidir — FIFO sıraya duyarlıdır.
 */
export function computePosition(transactions: Transaction[], fxRates: FxRates): Position {
  const lots: { qty: number; tl: number; usd: number }[] = [];
  let realizedPL = 0;
  let realizedPLUSD = 0;

  for (const tx of transactions) {
    const qty = Number(tx.quantity);
    const prices = convertTxPrice(tx, fxRates);
    if (!prices || !Number.isFinite(qty)) continue;

    if (tx.type === 'buy') {
      if (qty <= 0) continue;
      lots.push({ qty, tl: prices.tl, usd: prices.usd });
    } else if (tx.type === 'sell') {
      let remaining = qty;
      while (remaining > EPSILON && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(remaining, lot.qty);
        realizedPL += (prices.tl - lot.tl) * take;
        realizedPLUSD += (prices.usd - lot.usd) * take;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= EPSILON) lots.shift();
      }
    } else if (tx.type === 'dividend') {
      realizedPL += qty * prices.tl;
      realizedPLUSD += qty * prices.usd;
    }
  }

  const totalQty = lots.reduce((s, l) => s + l.qty, 0);
  const totalCost = lots.reduce((s, l) => s + l.qty * l.tl, 0);
  const totalCostUSD = lots.reduce((s, l) => s + l.qty * l.usd, 0);

  return {
    totalQty,
    totalCost,
    totalCostUSD,
    avgCost: totalQty > EPSILON ? totalCost / totalQty : 0,
    realizedPL,
    realizedPLUSD,
  };
}

/**
 * Elde tutulan adet. Satış kontrolünde kullanılır; temettü adedi etkilemez.
 */
export function heldQuantity(transactions: Transaction[]): number {
  return transactions.reduce((qty, tx) => {
    const q = Number(tx.quantity);
    if (!Number.isFinite(q)) return qty;
    if (tx.type === 'buy') return qty + q;
    if (tx.type === 'sell') return qty - q;
    return qty;
  }, 0);
}
