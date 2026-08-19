import { describe, it, expect } from 'vitest';
import { baseSymbol, isTickerLike, mergeAndRank, type SearchResult } from './searchRank';

const r = (symbol: string, name = symbol, type = 'stock'): SearchResult => ({ symbol, name, type });

describe('baseSymbol', () => {
  it('borsa sonekini atar', () => {
    expect(baseSymbol('INFO.IS')).toBe('INFO');
    expect(baseSymbol('AAPL')).toBe('AAPL');
    expect(baseSymbol('aapl.vi')).toBe('AAPL');
  });
});

describe('isTickerLike', () => {
  it('borsa kodu gibi duran sorguları tanır', () => {
    expect(isTickerLike('INFO')).toBe(true);
    expect(isTickerLike(' thyao ')).toBe(true);
  });

  // Şirket adı aramalarında ".IS" denemesi anlamsız ve fazladan istek.
  it('şirket adı ve uzun sorguları eler', () => {
    expect(isTickerLike('info yatirim')).toBe(false);
    expect(isTickerLike('A')).toBe(false);
    expect(isTickerLike('BERKSHIRE')).toBe(false);
    expect(isTickerLike('AAPL.VI')).toBe(false);
  });
});

describe('mergeAndRank', () => {
  // Asıl hata buydu: INFO araması Amerikan fonunu getiriyor, Info Yatırım
  // hiç listelenmiyordu.
  it('BIST sonucunu aynı isimli yabancı sonucun önüne alır', () => {
    const bist = [r('INFO.IS', 'Info Yatirim Menkul Degerler A.S.')];
    const general = [r('INFO', 'Harbor PanAgora Dynamic Large C', 'fund'), r('INFY', 'Infosys Limited')];
    expect(mergeAndRank(bist, general, 'INFO').map(x => x.symbol)).toEqual(['INFO.IS', 'INFO', 'INFY']);
  });

  it('birebir eşleşmeyenleri alta iter', () => {
    const general = [r('VGT', 'Vanguard Information Technology'), r('INFO', 'Harbor PanAgora', 'fund')];
    expect(mergeAndRank([], general, 'INFO').map(x => x.symbol)).toEqual(['INFO', 'VGT']);
  });

  it('aynı sembolü iki kez listelemez', () => {
    const bist = [r('THYAO.IS', 'Türk Hava Yolları')];
    const general = [r('THYAO.IS', 'Türk Hava Yolları')];
    expect(mergeAndRank(bist, general, 'THYAO')).toHaveLength(1);
  });

  // Eşit puanlılarda Yahoo'nun alaka sırası korunmalı; kendi ölçütümüz yok.
  it('eşit puanlıların sırasını bozmaz', () => {
    const general = [r('AAA'), r('BBB'), r('CCC')];
    expect(mergeAndRank([], general, 'ZZZ').map(x => x.symbol)).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('BIST sonucu yoksa genel sonuçlar aynen kalır', () => {
    const general = [r('AAPL', 'Apple Inc.'), r('AAPL.VI', 'Apple Inc.')];
    expect(mergeAndRank([], general, 'AAPL').map(x => x.symbol)).toEqual(['AAPL', 'AAPL.VI']);
  });

  it('boş girdide boş döner', () => {
    expect(mergeAndRank([], [], 'INFO')).toEqual([]);
  });
});
