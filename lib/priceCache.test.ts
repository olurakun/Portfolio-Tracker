import { describe, it, expect } from 'vitest';
import { hasRestatement, cacheCutoff, addDays, SETTLING_DAYS } from './priceCache';

describe('addDays', () => {
  it('gün ekler', () => {
    expect(addDays('2026-08-18', 1)).toBe('2026-08-19');
  });

  it('ay sınırını geçer', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('negatif değerle geri gider', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('cacheCutoff', () => {
  it('bugünden oturma penceresi kadar geriye gider', () => {
    expect(cacheCutoff(new Date('2026-08-18T12:00:00Z'))).toBe(
      addDays('2026-08-18', -SETTLING_DAYS)
    );
  });

  // Son günler henüz kesinleşmemiş olabilir; önbelleğe alınmamalılar.
  it('bugünü kapsamaz', () => {
    expect(cacheCutoff(new Date('2026-08-18T12:00:00Z')) < '2026-08-18').toBe(true);
  });
});

describe('hasRestatement', () => {
  it('fiyatlar aynıysa düzeltme yok', () => {
    expect(hasRestatement(
      { '2026-01-05': 100, '2026-01-06': 110 },
      { '2026-01-05': 100, '2026-01-06': 110 },
    )).toBe(false);
  });

  it('binde 5 altındaki farkı yuvarlama sayar', () => {
    expect(hasRestatement({ '2026-01-05': 100 }, { '2026-01-05': 100.4 })).toBe(false);
  });

  // Bölünmenin imzası: geçmiş fiyatların tamamı kat kat değişir.
  it('bölünmeyi yakalar', () => {
    expect(hasRestatement(
      { '2026-01-05': 100, '2026-01-06': 110 },
      { '2026-01-05': 50,  '2026-01-06': 55 },   // 1/2 bölünme
    )).toBe(true);
  });

  it('tek günlük ciddi sapmada bile düzeltme sayar', () => {
    expect(hasRestatement(
      { '2026-01-05': 100, '2026-01-06': 110 },
      { '2026-01-05': 100, '2026-01-06': 90 },
    )).toBe(true);
  });

  it('çakışmayan günleri karşılaştırmaz', () => {
    expect(hasRestatement({ '2026-01-05': 100 }, { '2026-02-01': 999 })).toBe(false);
  });

  it('boş önbellekte düzeltme yok', () => {
    expect(hasRestatement({}, { '2026-01-05': 100 })).toBe(false);
  });

  it('önbellekteki sıfır fiyatı karşılaştırmaz', () => {
    expect(hasRestatement({ '2026-01-05': 0 }, { '2026-01-05': 100 })).toBe(false);
  });
});

