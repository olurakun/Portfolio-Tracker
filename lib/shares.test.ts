import { describe, it, expect } from 'vitest';
import { buildShareSnapshot, DEFAULT_SHARE_COLUMNS, type ShareableRow, type ShareConfig } from './shares';

const row = (o: Partial<ShareableRow> & { symbol: string; type: string; value: number }): ShareableRow => ({
  totalQty: 10, currentPrice: 100, currentPriceUSD: 3,
  valueUSD: o.value / 33, unrealizedPL: 0, unrealizedPLUSD: 0, realizedPL: 0, realizedPLUSD: 0,
  ...o,
});

const allColumns: ShareConfig = { assetTypes: null, columns: DEFAULT_SHARE_COLUMNS };

describe('buildShareSnapshot — varlık tipi filtresi', () => {
  const rows = [
    row({ symbol: 'THYAO', type: 'stock', value: 1000 }),
    row({ symbol: 'TLY', type: 'fund', value: 500 }),
    row({ symbol: 'USD', type: 'currency', value: 300 }),
  ];

  it('assetTypes null ise hepsini dahil eder', () => {
    expect(buildShareSnapshot(rows, allColumns).rows.map(r => r.symbol)).toEqual(['THYAO', 'TLY', 'USD']);
  });

  it('assetTypes verilirse yalnızca o tipleri dahil eder', () => {
    const cfg: ShareConfig = { assetTypes: ['stock'], columns: DEFAULT_SHARE_COLUMNS };
    expect(buildShareSnapshot(rows, cfg).rows.map(r => r.symbol)).toEqual(['THYAO']);
  });

  it('birden fazla tip seçilebilir', () => {
    const cfg: ShareConfig = { assetTypes: ['stock', 'fund'], columns: DEFAULT_SHARE_COLUMNS };
    expect(buildShareSnapshot(rows, cfg).rows.map(r => r.symbol)).toEqual(['THYAO', 'TLY']);
  });

  it('hiçbir satır eşleşmezse boş döner (bölme hatası vermez)', () => {
    const cfg: ShareConfig = { assetTypes: ['metal'], columns: DEFAULT_SHARE_COLUMNS };
    expect(buildShareSnapshot(rows, cfg).rows).toEqual([]);
    expect(buildShareSnapshot(rows, cfg).totals.value).toBe(0);
  });
});

describe('buildShareSnapshot — yüzde ALT KÜME içinde hesaplanır (kullanıcının kararı)', () => {
  const rows = [
    row({ symbol: 'THYAO', type: 'stock', value: 300 }),
    row({ symbol: 'AAPL', type: 'stock', value: 700 }),
    // Bu, tüm portföyün %90'ı — ama paylaşımda YOK. Hisse yüzdeleri buna göre
    // DEĞİL, yalnızca gösterilen iki hisseye göre hesaplanmalı.
    row({ symbol: 'XAU', type: 'metal', value: 9000 }),
  ];
  const cfg: ShareConfig = { assetTypes: ['stock'], columns: DEFAULT_SHARE_COLUMNS };

  it('yüzdeler yalnızca gösterilen alt kümeye göre %100\'e tamamlanır', () => {
    const { rows: out } = buildShareSnapshot(rows, cfg);
    const thyao = out.find(r => r.symbol === 'THYAO')!;
    const aapl = out.find(r => r.symbol === 'AAPL')!;
    expect(thyao.share).toBeCloseTo(30);
    expect(aapl.share).toBeCloseTo(70);
    expect(thyao.share! + aapl.share!).toBeCloseTo(100);
  });

  it('gizli varlığın büyüklüğü toplamlara hiç sızmaz', () => {
    const { totals } = buildShareSnapshot(rows, cfg);
    expect(totals.value).toBe(1000); // 300 + 700, XAU'nun 9000'i dahil değil
  });
});

describe('buildShareSnapshot — gizlenen sütun ÇIKTIDA HİÇ BULUNMAZ', () => {
  // Bu grup, özelliğin tek gerçek güvenlik garantisini doğruluyor: arayüzde
  // saklamak yetmez, JSON'da da olmamalı — aksi hâlde geliştirici araçlarından
  // okunabilir.
  const rows = [row({ symbol: 'THYAO', type: 'stock', value: 1000, unrealizedPL: 50, realizedPL: 20 })];

  it('değer gizlenince value/valueUSD hiç yazılmaz', () => {
    const cfg: ShareConfig = { assetTypes: null, columns: { ...DEFAULT_SHARE_COLUMNS, value: false } };
    const out = buildShareSnapshot(rows, cfg).rows[0];
    expect(out).not.toHaveProperty('value');
    expect(out).not.toHaveProperty('valueUSD');
  });

  it('K/Z gizlenince unrealizedPL/realizedPL hiç yazılmaz', () => {
    const cfg: ShareConfig = {
      assetTypes: null,
      columns: { ...DEFAULT_SHARE_COLUMNS, unrealizedPL: false, realizedPL: false },
    };
    const out = buildShareSnapshot(rows, cfg).rows[0];
    expect(out).not.toHaveProperty('unrealizedPL');
    expect(out).not.toHaveProperty('unrealizedPLUSD');
    expect(out).not.toHaveProperty('realizedPL');
    expect(out).not.toHaveProperty('realizedPLUSD');
  });

  it('adet gizlenince quantity hiç yazılmaz', () => {
    const cfg: ShareConfig = { assetTypes: null, columns: { ...DEFAULT_SHARE_COLUMNS, quantity: false } };
    expect(buildShareSnapshot(rows, cfg).rows[0]).not.toHaveProperty('quantity');
  });

  it('fiyat gizlenince price/priceUSD hiç yazılmaz', () => {
    const cfg: ShareConfig = { assetTypes: null, columns: { ...DEFAULT_SHARE_COLUMNS, price: false } };
    const out = buildShareSnapshot(rows, cfg).rows[0];
    expect(out).not.toHaveProperty('price');
    expect(out).not.toHaveProperty('priceUSD');
  });

  it('pay gizlenince share hiç yazılmaz', () => {
    const cfg: ShareConfig = { assetTypes: null, columns: { ...DEFAULT_SHARE_COLUMNS, share: false } };
    expect(buildShareSnapshot(rows, cfg).rows[0]).not.toHaveProperty('share');
  });

  it('değer gizlenince toplamdaki value de gizlenir', () => {
    const cfg: ShareConfig = { assetTypes: null, columns: { ...DEFAULT_SHARE_COLUMNS, value: false } };
    expect(buildShareSnapshot(rows, cfg).totals).not.toHaveProperty('value');
  });

  it('sembol ve tip her zaman görünür — kapatılamaz', () => {
    const cfg: ShareConfig = {
      assetTypes: null,
      columns: { quantity: false, price: false, value: false, share: false, unrealizedPL: false, realizedPL: false },
    };
    const out = buildShareSnapshot(rows, cfg).rows[0];
    expect(out).toEqual({ symbol: 'THYAO', type: 'stock' });
  });
});
