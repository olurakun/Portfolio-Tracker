import { describe, it, expect } from 'vitest';
import { rateOn, convertTxPrice, computePosition, heldQuantity, findNegativePositions, type Transaction, type FxRates } from './portfolio';

// Kurlar gerçek hayatta hafta içi yayınlanır; 16-17'si hafta sonuna denk geliyor.
const FX: FxRates = {
  '2026-01-05': 30,
  '2026-01-06': 32,
  '2026-01-07': 40,
  '2026-01-15': 50,
};

const tx = (o: Partial<Transaction>): Transaction => ({
  asset_id: 1, type: 'buy', quantity: 1, price: 100, date: '2026-01-05', ...o,
});

describe('rateOn', () => {
  it('tam eşleşen tarihin kurunu döner', () => {
    expect(rateOn('2026-01-06', FX)).toBe(32);
  });

  it('kur yayınlanmayan güne, o güne kadarki son kuru uygular', () => {
    // 8-14 Ocak arası kayıt yok; 7 Ocak geçerli kalmalı.
    expect(rateOn('2026-01-10', FX)).toBe(40);
  });

  it('ilk kurdan önceki tarih için null döner', () => {
    expect(rateOn('2026-01-01', FX)).toBeNull();
  });

  it('boş tarih için null döner', () => {
    expect(rateOn('', FX)).toBeNull();
  });

  it('sözlük sırası bozuk olsa da en yakın önceki tarihi bulur', () => {
    const scrambled: FxRates = { '2026-01-15': 50, '2026-01-05': 30, '2026-01-07': 40 };
    expect(rateOn('2026-01-08', scrambled)).toBe(40);
  });
});

describe('convertTxPrice', () => {
  it('TL işlemin TL fiyatı aynen kalır, USD karşılığı o günün kuruyla bulunur', () => {
    expect(convertTxPrice(tx({ price: 320, currency: 'TRY', date: '2026-01-06' }), FX))
      .toEqual({ tl: 320, usd: 10 });
  });

  it('USD işlemin USD fiyatı aynen kalır, TL karşılığı o günün kuruyla bulunur', () => {
    expect(convertTxPrice(tx({ price: 10, currency: 'USD', date: '2026-01-06' }), FX))
      .toEqual({ tl: 320, usd: 10 });
  });

  it('para birimi verilmezse TRY varsayar', () => {
    expect(convertTxPrice(tx({ price: 100, currency: undefined, date: '2026-01-05' }), FX))
      .toEqual({ tl: 100, usd: 100 / 30 });
  });

  it('küçük harfli para birimini tanır', () => {
    expect(convertTxPrice(tx({ price: 10, currency: 'usd', date: '2026-01-05' }), FX)?.tl).toBe(300);
  });

  // Bu ayrım kritik: bugünkü kur kullanılsaydı geçmiş dolar alımlarının TL maliyeti
  // kurun bugünkü seviyesine göre şişerdi ve kâr/zarar tamamen yanlış çıkardı.
  it('bugünkü kuru değil, İŞLEM TARİHİNDEKİ kuru kullanır', () => {
    const erken = convertTxPrice(tx({ price: 10, currency: 'USD', date: '2026-01-05' }), FX);
    const gec = convertTxPrice(tx({ price: 10, currency: 'USD', date: '2026-01-15' }), FX);
    expect(erken?.tl).toBe(300);
    expect(gec?.tl).toBe(500);
  });

  it('desteklenmeyen para birimi için null döner', () => {
    expect(convertTxPrice(tx({ currency: 'EUR' }), FX)).toBeNull();
  });

  it('kur bilinmiyorsa TL fiyatı korur, USD karşılığını 0 bırakır', () => {
    const r = convertTxPrice(tx({ price: 100, currency: 'TRY', date: '2020-01-01' }), FX);
    expect(r).toEqual({ tl: 100, usd: 0 });
  });

  it('sayı olmayan fiyat için null döner', () => {
    expect(convertTxPrice(tx({ price: 'abc' }), FX)).toBeNull();
  });
});

describe('computePosition — alımlar', () => {
  it('tek alımın maliyetini ve adedini hesaplar', () => {
    const p = computePosition([tx({ quantity: 10, price: 50 })], FX);
    expect(p.totalQty).toBe(10);
    expect(p.totalCost).toBe(500);
    expect(p.avgCost).toBe(50);
    expect(p.realizedPL).toBe(0);
  });

  it('birden fazla alımda ortalama maliyeti ağırlıklı hesaplar', () => {
    const p = computePosition([
      tx({ quantity: 10, price: 100 }),
      tx({ quantity: 30, price: 200 }),
    ], FX);
    expect(p.totalQty).toBe(40);
    expect(p.avgCost).toBe(175); // (1000 + 6000) / 40
  });

  it('sıfır veya negatif adetli alımı yok sayar', () => {
    const p = computePosition([tx({ quantity: 0 }), tx({ quantity: -5 })], FX);
    expect(p.totalQty).toBe(0);
  });
});

describe('computePosition — FIFO', () => {
  // Bu senaryo, ağırlıklı ortalamadan FIFO'ya geçişin sebebi olan durumun
  // sadeleştirilmiş hâli: kısmi satıştan sonra iki yöntem farklı sonuç veriyor.
  // Aracı kurum ekstresi FIFO kullandığı için rakamların tutması buna bağlı.
  it('kısmi satışta en eski lottan düşer (ağırlıklı ortalamadan farklı sonuç)', () => {
    const p = computePosition([
      tx({ quantity: 2, price: 100, date: '2026-01-05' }),
      tx({ quantity: 2, price: 200, date: '2026-01-06' }),
      tx({ type: 'sell', quantity: 2, price: 300, date: '2026-01-07' }),
    ], FX);

    // FIFO: 100'lük lot satıldı, elde 200'lük lot kaldı.
    expect(p.totalQty).toBe(2);
    expect(p.avgCost).toBe(200);
    expect(p.realizedPL).toBe(400); // (300 - 100) × 2

    // Ağırlıklı ortalama olsaydı ortalama 150, realize 300 çıkardı.
    expect(p.avgCost).not.toBe(150);
    expect(p.realizedPL).not.toBe(300);
  });

  it('tek satış birden fazla lotu tüketebilir', () => {
    const p = computePosition([
      tx({ quantity: 2, price: 100 }),
      tx({ quantity: 2, price: 200 }),
      tx({ quantity: 2, price: 300 }),
      tx({ type: 'sell', quantity: 3, price: 400 }),
    ], FX);

    // 2 adet 100'den + 1 adet 200'den satıldı.
    expect(p.realizedPL).toBe(2 * 300 + 1 * 200);
    expect(p.totalQty).toBe(3);
    // Kalan: 1 adet 200, 2 adet 300.
    expect(p.totalCost).toBe(200 + 600);
  });

  it('tamamen satılan pozisyonda adet ve maliyet sıfırlanır, kâr realize olur', () => {
    const p = computePosition([
      tx({ quantity: 5, price: 100 }),
      tx({ type: 'sell', quantity: 5, price: 150 }),
    ], FX);
    expect(p.totalQty).toBe(0);
    expect(p.totalCost).toBe(0);
    expect(p.avgCost).toBe(0);
    expect(p.realizedPL).toBe(250);
  });

  it('zararına satışta realize K/Z negatif olur', () => {
    const p = computePosition([
      tx({ quantity: 4, price: 100 }),
      tx({ type: 'sell', quantity: 4, price: 60 }),
    ], FX);
    expect(p.realizedPL).toBe(-160);
  });

  it('elde olandan fazla satış adedi negatife düşürmez', () => {
    const p = computePosition([
      tx({ quantity: 3, price: 100 }),
      tx({ type: 'sell', quantity: 10, price: 150 }),
    ], FX);
    expect(p.totalQty).toBe(0);
    expect(p.realizedPL).toBe(150); // yalnızca eldeki 3 adet üzerinden
  });

  it('elde hiç yokken gelen satışı yok sayar', () => {
    const p = computePosition([tx({ type: 'sell', quantity: 5, price: 100 })], FX);
    expect(p.totalQty).toBe(0);
    expect(p.realizedPL).toBe(0);
  });

  it('ondalıklı adetlerde lot tam tükendiğinde artık bırakmaz', () => {
    const p = computePosition([
      tx({ quantity: 0.351914785, price: 284.16 }),
      tx({ type: 'sell', quantity: 0.351914785, price: 302.85 }),
    ], FX);
    expect(p.totalQty).toBeCloseTo(0, 10);
    expect(p.realizedPL).toBeCloseTo(0.351914785 * (302.85 - 284.16), 10);
  });
});

describe('computePosition — temettü', () => {
  it('temettü adedi değiştirmez, tutarı realize gelire ekler', () => {
    const p = computePosition([
      tx({ quantity: 15, price: 100 }),
      tx({ type: 'dividend', quantity: 1, price: 17 }),
    ], FX);
    expect(p.totalQty).toBe(15);
    expect(p.totalCost).toBe(1500); // maliyet temettüden etkilenmez
    expect(p.realizedPL).toBe(17);
  });

  it('temettü elde hisse yokken de gelir olarak sayılır', () => {
    const p = computePosition([
      tx({ quantity: 5, price: 100 }),
      tx({ type: 'sell', quantity: 5, price: 100 }),
      tx({ type: 'dividend', quantity: 1, price: 42 }),
    ], FX);
    expect(p.totalQty).toBe(0);
    expect(p.realizedPL).toBe(42);
  });
});

describe('computePosition — çift para birimi', () => {
  it('dolar işlemin maliyetini her iki para biriminde ayrı tutar', () => {
    const p = computePosition([
      tx({ quantity: 2, price: 10, currency: 'USD', date: '2026-01-05' }), // kur 30
    ], FX);
    expect(p.totalCostUSD).toBe(20);
    expect(p.totalCost).toBe(600);
  });

  // Kur yükselirken dolar bazında zarar eden bir işlem TL bazında kâr edebilir.
  // İki bazın ayrı tutulmasının sebebi tam olarak bu.
  it('kur etkisi TL ve USD realize K/Z\'yi ayrıştırır', () => {
    const p = computePosition([
      tx({ quantity: 1, price: 10, currency: 'USD', date: '2026-01-05' }),  // kur 30 → 300 TL
      tx({ type: 'sell', quantity: 1, price: 9, currency: 'USD', date: '2026-01-15' }), // kur 50 → 450 TL
    ], FX);
    expect(p.realizedPLUSD).toBe(-1);   // dolar bazında zarar
    expect(p.realizedPL).toBe(150);     // TL bazında kâr (kur farkı)
  });

  it('TL işlemlerde de USD bazlı maliyet hesaplanır', () => {
    const p = computePosition([
      tx({ quantity: 1, price: 300, currency: 'TRY', date: '2026-01-05' }), // kur 30
    ], FX);
    expect(p.totalCostUSD).toBe(10);
  });

  it('desteklenmeyen para birimli işlemi hesaba katmaz', () => {
    const p = computePosition([
      tx({ quantity: 5, price: 100, currency: 'TRY' }),
      tx({ quantity: 5, price: 100, currency: 'EUR' }),
    ], FX);
    expect(p.totalQty).toBe(5);
  });
});

describe('findNegativePositions', () => {
  const row = (symbol: string, type: 'buy' | 'sell', quantity: number) => ({ symbol, type, quantity });

  it('dengeli dosyada uyarı üretmez', () => {
    expect(findNegativePositions({}, [
      row('THYAO', 'buy', 100),
      row('THYAO', 'sell', 40),
    ])).toEqual([]);
  });

  // Eksik geçmiş alımın imzası: dosyadaki satış, dosyadaki alımdan fazla.
  it('alımı olmayan satışı yakalar', () => {
    expect(findNegativePositions({}, [row('TLY', 'sell', 18)]))
      .toEqual([{ symbol: 'TLY', net: -18 }]);
  });

  it('portföyde hâlihazırda tutulan adedi hesaba katar', () => {
    // Elde 20 varken 18 satmak sorun değil.
    expect(findNegativePositions({ TLY: 20 }, [row('TLY', 'sell', 18)])).toEqual([]);
    // Elde 10 varken 18 satmak eksik alım demek.
    expect(findNegativePositions({ TLY: 10 }, [row('TLY', 'sell', 18)]))
      .toEqual([{ symbol: 'TLY', net: -8 }]);
  });

  it('yalnızca negatife düşen sembolleri döner', () => {
    const r = findNegativePositions({}, [
      row('AAA', 'buy', 5),
      row('BBB', 'sell', 3),
      row('CCC', 'buy', 1),
      row('CCC', 'sell', 4),
    ]);
    expect(r.map(x => x.symbol)).toEqual(['BBB', 'CCC']);
  });

  it('tam sıfıra inen pozisyonu uyarı saymaz', () => {
    expect(findNegativePositions({}, [
      row('AAA', 'buy', 5),
      row('AAA', 'sell', 5),
    ])).toEqual([]);
  });

  it('ondalık artıklar yüzünden yanlış uyarı vermez', () => {
    expect(findNegativePositions({}, [
      row('UNH', 'buy', 0.351914785),
      row('UNH', 'sell', 0.351914785),
    ])).toEqual([]);
  });

  it('temettü satırları adedi etkilemez', () => {
    expect(findNegativePositions({}, [
      { symbol: 'BIMAS', type: 'dividend' as const, quantity: 1 },
    ])).toEqual([]);
  });
});

describe('heldQuantity', () => {
  it('alım ve satımların net adedini verir', () => {
    expect(heldQuantity([
      tx({ quantity: 10 }),
      tx({ type: 'sell', quantity: 4 }),
    ])).toBe(6);
  });

  it('temettüyü adede katmaz', () => {
    expect(heldQuantity([
      tx({ quantity: 10 }),
      tx({ type: 'dividend', quantity: 1, price: 50 }),
    ])).toBe(10);
  });

  it('işlem yoksa sıfır döner', () => {
    expect(heldQuantity([])).toBe(0);
  });
});
