import { describe, it, expect } from 'vitest';
import { priceAsOf, indexSeries, totalReturnPct, businessDays } from './compare';

describe('priceAsOf', () => {
  const s = { '2026-01-05': 100, '2026-01-07': 110 };

  it('tam eşleşen tarihin fiyatını döner', () => {
    expect(priceAsOf(s, '2026-01-07')).toBe(110);
  });

  it('fiyat olmayan güne son bilinen fiyatı uygular', () => {
    expect(priceAsOf(s, '2026-01-06')).toBe(100);
    expect(priceAsOf(s, '2026-02-01')).toBe(110);
  });

  it('ilk fiyattan önceki tarih için null döner', () => {
    expect(priceAsOf(s, '2026-01-01')).toBeNull();
  });

  it('boş seride null döner', () => {
    expect(priceAsOf({}, '2026-01-05')).toBeNull();
  });
});

describe('indexSeries', () => {
  const dates = ['2026-01-05', '2026-01-06', '2026-01-07'];

  it('ilk günü 100 kabul eder', () => {
    const r = indexSeries({ '2026-01-05': 200, '2026-01-07': 240 }, dates);
    expect(r[0]).toEqual({ date: '2026-01-05', value: 100 });
  });

  it('yüzde değişimi endekse çevirir', () => {
    const r = indexSeries({ '2026-01-05': 200, '2026-01-07': 240 }, dates);
    expect(r[r.length - 1].value).toBeCloseTo(120, 10); // %20 artış
  });

  // Endeksleme olmadan bu iki varlık aynı eksende karşılaştırılamazdı.
  it('farklı fiyat seviyelerindeki varlıkları kıyaslanabilir yapar', () => {
    const altin  = indexSeries({ '2026-01-05': 6800, '2026-01-07': 7140 }, dates); // %5
    const hisse  = indexSeries({ '2026-01-05': 200,  '2026-01-07': 210 },  dates); // %5
    expect(totalReturnPct(altin)).toBeCloseTo(totalReturnPct(hisse), 10);
  });

  it('düşen seride endeks 100 altına iner', () => {
    const r = indexSeries({ '2026-01-05': 100, '2026-01-07': 80 }, dates);
    expect(totalReturnPct(r)).toBeCloseTo(-20, 10);
  });

  it('aralıkta hiç fiyatı olmayan seri için boş döner', () => {
    expect(indexSeries({ '2025-01-01': 50 }, dates)).toEqual([]);
  });

  it('tamamen boş seri için boş döner', () => {
    expect(indexSeries({}, dates)).toEqual([]);
  });

  it('sıfır fiyatları taban olarak kullanmaz', () => {
    // TEFAS fiyatı açıklanmamış günü 0 döndürüyor; taban 0 olursa endeks sonsuza gider.
    const r = indexSeries({ '2026-01-05': 0, '2026-01-06': 50, '2026-01-07': 60 }, dates);
    expect(r[0]).toEqual({ date: '2026-01-06', value: 100 });
    expect(totalReturnPct(r)).toBeCloseTo(20, 10);
  });

  it('aralık sonradan başlayan varlığı ilk işlem gününden endeksler', () => {
    const r = indexSeries({ '2026-01-06': 50, '2026-01-07': 55 }, dates);
    expect(r.length).toBe(2);
    expect(r[0].value).toBe(100);
  });
});

describe('totalReturnPct', () => {
  it('tek noktalı seride sıfır döner', () => {
    expect(totalReturnPct([{ date: '2026-01-05', value: 100 }])).toBe(0);
  });

  it('boş seride sıfır döner', () => {
    expect(totalReturnPct([])).toBe(0);
  });
});

describe('businessDays', () => {
  it('hafta sonlarını atlar', () => {
    // 2026-01-05 pazartesi, 10-11 hafta sonu.
    const d = businessDays('2026-01-05', '2026-01-12');
    expect(d).toEqual([
      '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-12',
    ]);
  });

  it('tek günlük aralıkta o günü döner', () => {
    expect(businessDays('2026-01-05', '2026-01-05')).toEqual(['2026-01-05']);
  });

  it('hafta sonuna denk gelen tek günde boş döner', () => {
    expect(businessDays('2026-01-10', '2026-01-11')).toEqual([]);
  });

  it('ters aralıkta boş döner', () => {
    expect(businessDays('2026-01-12', '2026-01-05')).toEqual([]);
  });
});
