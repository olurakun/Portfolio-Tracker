// Bileşen önizlemesi için sahte veri.
//
// Gerçek portföy verisi KULLANILMAZ — depo public. Buradaki her şey uydurma,
// ama gerçekte karşılaşılan zor durumları temsil ediyor: eksi kâr, ondalıklı
// adet, USD/TRY karışık, hatalı satır, yinelenen işlem.
import type { PortfolioRow } from "../components/PortfolioTable";
import type { ParsedRow } from "../../lib/importParse";

export const positions: PortfolioRow[] = [
  { id: '1', symbol: 'THYAO', type: 'stock', totalQty: 1250, currentPrice: 305.25, currentPriceUSD: 8.94,
    value: 381562.5, valueUSD: 11175, unrealizedPL: 42310.75, realizedPL: 0, unrealizedPLUSD: 1240.2, realizedPLUSD: 0 },
  { id: '2', symbol: 'AAPL', type: 'stock', totalQty: 40, currentPrice: 10122.4, currentPriceUSD: 296.42,
    value: 404896, valueUSD: 11856.8, unrealizedPL: -18420.6, realizedPL: 5210.4, unrealizedPLUSD: -540.1, realizedPLUSD: 152.6 },
  { id: '3', symbol: 'TLY', type: 'fund', totalQty: 85.234567, currentPrice: 7369.52, currentPriceUSD: 215.8,
    value: 628050.11, valueUSD: 18393.5, unrealizedPL: 96204.02, realizedPL: 0, unrealizedPLUSD: 2818, realizedPLUSD: 0 },
  { id: '4', symbol: 'XAU', type: 'metal', totalQty: 320, currentPrice: 6832.11, currentPriceUSD: 200.08,
    value: 2186275.2, valueUSD: 64025.6, unrealizedPL: 318902.4, realizedPL: 12055, unrealizedPLUSD: 9340.3, realizedPLUSD: 353 },
  { id: '5', symbol: 'USD', type: 'currency', totalQty: 5000, currentPrice: 34.14, currentPriceUSD: 1,
    value: 170700, valueUSD: 5000, unrealizedPL: 8420, realizedPL: 0, unrealizedPLUSD: 0, realizedPLUSD: 0 },
];

export const closedPositions: PortfolioRow[] = [
  { id: '6', symbol: 'ASELS', type: 'stock', totalQty: 0, currentPrice: 212.8, currentPriceUSD: 6.23,
    value: 0, valueUSD: 0, unrealizedPL: 0, realizedPL: -3204.5, unrealizedPLUSD: 0, realizedPLUSD: -93.8 },
];

export const totals = { value: 3771483.81, valueUSD: 110450.9, unrealizedPL: 447416.57, realizedPL: 14060.9 };
export const emptyTotals = { value: 0, valueUSD: 0, unrealizedPL: 0, realizedPL: 0 };

export const importRows: ParsedRow[] = [
  { row: 2, symbol: 'THYAO', type: 'buy', quantity: 100, price: 305.25, date: '2026-06-15', currency: 'TRY' },
  { row: 3, symbol: 'AAPL', type: 'buy', quantity: 10, price: 296.42, date: '2026-06-20', currency: 'USD' },
  { row: 4, symbol: 'THYAO', type: 'sell', quantity: 40, price: 318, date: '2026-07-01', currency: 'TRY' },
  { row: 5, symbol: 'TLY', type: 'buy', quantity: 5.234567, price: 7369.52, date: '2026-07-14', currency: 'TRY' },
  { row: 6, symbol: 'THYAO', type: 'dividend', quantity: 1, price: 125.5, date: '2026-08-10', currency: 'TRY' },
  { row: 7, symbol: 'SASA', type: 'buy', quantity: 0, price: 0, date: '', currency: 'TRY',
    error: 'adet okunamadı, fiyat okunamadı, tarih okunamadı' },
];

export const importMeta = {
  // Kaynak sayısı ile çıkan satır sayısı kasten tutmuyor: uyarının çalıştığı görülsün.
  sourceTransactionCount: 8,
  skipped: [
    '16.06.2026 ASELS alım — emir iptal edilmiş',
    '20.06.2026 nakit yatırma — varlık işlemi değil',
    '22.06.2026 SAP alım — EUR işlemi desteklenmiyor',
  ],
};

export const negatives = [{ symbol: 'ASELS', net: -120 }];

export const brokerTotals = [
  { broker: 'Midas', value: 1414508.61 },
  { broker: 'Yapı Kredi', value: 2186275.2 },
  { broker: '', value: 170700 },
];
