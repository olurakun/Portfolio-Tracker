import { describe, it, expect } from 'vitest';
import { sortPositions, nextSortState } from './sortPositions';

const rows = [
  { symbol: 'THYAO', totalQty: 100, value: 30_000, unrealizedPL: -500, realizedPL: 0 },
  { symbol: 'AKBNK', totalQty: 5,   value: 90_000, unrealizedPL: 1_200, realizedPL: 340 },
  { symbol: 'ZOREN', totalQty: 250, value: 10_000, unrealizedPL: 75,    realizedPL: -20 },
];

const symbols = (r: { symbol: string }[]) => r.map(x => x.symbol);

describe('sortPositions', () => {
  it('değere göre büyükten küçüğe sıralar', () => {
    expect(symbols(sortPositions(rows, 'value', 'desc'))).toEqual(['AKBNK', 'THYAO', 'ZOREN']);
  });

  it('yönü çevirince küçükten büyüğe sıralar', () => {
    expect(symbols(sortPositions(rows, 'value', 'asc'))).toEqual(['ZOREN', 'THYAO', 'AKBNK']);
  });

  it('adede göre sıralar (değerden bağımsız)', () => {
    expect(symbols(sortPositions(rows, 'totalQty', 'desc'))).toEqual(['ZOREN', 'THYAO', 'AKBNK']);
  });

  it('negatif kâr/zararı doğru sıralar', () => {
    expect(symbols(sortPositions(rows, 'unrealizedPL', 'asc'))).toEqual(['THYAO', 'ZOREN', 'AKBNK']);
  });

  it('sembolü alfabetik sıralar', () => {
    expect(symbols(sortPositions(rows, 'symbol', 'asc'))).toEqual(['AKBNK', 'THYAO', 'ZOREN']);
  });

  // Varsayılan karşılaştırma Ç ve Ö'yü alfabenin sonuna atar; Türkçede
  // C ve O'dan hemen sonra gelmeleri gerekir.
  it('Türkçe harfleri doğru yere koyar', () => {
    const tr = [{ symbol: 'DOAS' }, { symbol: 'ÇEMTS' }, { symbol: 'CCOLA' }, { symbol: 'ÖZKGY' }];
    expect(symbols(sortPositions(tr, 'symbol', 'asc'))).toEqual(['CCOLA', 'ÇEMTS', 'DOAS', 'ÖZKGY']);
  });

  it('girdi dizisini değiştirmez', () => {
    const original = [...rows];
    sortPositions(rows, 'value', 'asc');
    expect(rows).toEqual(original);
  });

  it('eksik veya sayı olmayan değerleri sıfır sayar, patlamaz', () => {
    const messy = [{ symbol: 'A', value: 10 }, { symbol: 'B' }, { symbol: 'C', value: null }];
    expect(symbols(sortPositions(messy as any, 'value', 'desc'))).toEqual(['A', 'B', 'C']);
  });

  it('boş listede sorun çıkarmaz', () => {
    expect(sortPositions([], 'value', 'desc')).toEqual([]);
  });
});

describe('nextSortState', () => {
  it('aynı sütuna tekrar tıklayınca yönü çevirir', () => {
    expect(nextSortState({ key: 'value', dir: 'desc' }, 'value')).toEqual({ key: 'value', dir: 'asc' });
    expect(nextSortState({ key: 'value', dir: 'asc' }, 'value')).toEqual({ key: 'value', dir: 'desc' });
  });

  it('yeni bir sayısal sütunda büyükten küçüğe başlar', () => {
    expect(nextSortState({ key: 'symbol', dir: 'asc' }, 'value')).toEqual({ key: 'value', dir: 'desc' });
  });

  it('sembol sütununda A\'dan Z\'ye başlar', () => {
    expect(nextSortState({ key: 'value', dir: 'desc' }, 'symbol')).toEqual({ key: 'symbol', dir: 'asc' });
  });
});
