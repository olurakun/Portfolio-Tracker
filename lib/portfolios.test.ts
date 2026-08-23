import { describe, it, expect } from 'vitest';
import {
  REAL, DEFAULT_SCENARIO, normalizePortfolio, portfolioKey, isReal,
  filterByPortfolio, scenariosOf, portfolioLabel, buildScenarioCopy,
} from './portfolios';

const tx = (portfolio?: string | null) => ({ portfolio });

describe('isReal', () => {
  // Mevcut 92+ kayıtta bu alan yok; hepsi gerçek portföy sayılmalı.
  it('boş, null ve tanımsız değerleri gerçek portföy sayar', () => {
    expect(isReal(null)).toBe(true);
    expect(isReal(undefined)).toBe(true);
    expect(isReal('')).toBe(true);
    expect(isReal('   ')).toBe(true);
  });

  it('adı olanları gerçek saymaz', () => {
    expect(isReal('Sanal')).toBe(false);
  });
});

describe('normalizePortfolio', () => {
  it('boşlukları toparlar', () => {
    expect(normalizePortfolio('  NVDA   senaryosu ')).toBe('NVDA senaryosu');
  });

  it('metin olmayanı gerçek portföye düşürür', () => {
    expect(normalizePortfolio(42)).toBe(REAL);
  });
});

describe('portfolioKey', () => {
  // Türkçe locale ile küçültmek "SANAL" ile "Sanal"ı ayırırdı.
  it('yazım farkını yok sayar', () => {
    expect(portfolioKey('SANAL')).toBe(portfolioKey('sanal'));
    expect(portfolioKey(' Sanal ')).toBe(portfolioKey('Sanal'));
  });
});

describe('filterByPortfolio', () => {
  const rows = [tx(), tx(null), tx('Sanal'), tx('sanal'), tx('NVDA senaryosu')];

  // BU TESTİN KIRILMASI CİDDİDİR: sanal işlem gerçek portföye sızarsa
  // kullanıcının asıl kâr/zararı sessizce yanlış olur.
  it('gerçek portföyde sanal işlem bulundurmaz', () => {
    const real = filterByPortfolio(rows, REAL);
    expect(real).toHaveLength(2);
    expect(real.every(r => !r.portfolio)).toBe(true);
  });

  it('senaryoyu yazım farkına bakmadan toplar', () => {
    expect(filterByPortfolio(rows, 'SANAL')).toHaveLength(2);
  });

  it('senaryolar birbirine karışmaz', () => {
    expect(filterByPortfolio(rows, 'NVDA senaryosu')).toHaveLength(1);
  });

  it('olmayan senaryoda boş döner', () => {
    expect(filterByPortfolio(rows, 'yok')).toEqual([]);
  });
});

describe('scenariosOf', () => {
  it('senaryoları Türkçe sıraya göre listeler', () => {
    expect(scenariosOf([tx('Sanal'), tx('Altın senaryosu'), tx()]))
      .toEqual(['Altın senaryosu', 'Sanal']);
  });

  it('aynı senaryonun farklı yazımlarını teke indirir', () => {
    expect(scenariosOf([tx('Sanal'), tx('sanal'), tx(' SANAL')])).toEqual(['Sanal']);
  });

  it('gerçek portföyü senaryo saymaz', () => {
    expect(scenariosOf([tx(), tx(null), tx('')])).toEqual([]);
  });
});

describe('portfolioLabel', () => {
  it('gerçek portföye okunur ad verir', () => {
    expect(portfolioLabel(REAL)).toBe('Gerçek');
    expect(portfolioLabel(DEFAULT_SCENARIO)).toBe('Sanal');
  });
});

describe('buildScenarioCopy', () => {
  const realTx = (o: Partial<{
    asset_id: string; type: string; quantity: number; price: number;
    date: string; currency: string | null; broker: string | null; portfolio: string | null;
  }> = {}) => ({
    asset_id: '1', type: 'buy', quantity: 10, price: 305.25,
    date: '2026-06-15', currency: 'TRY', broker: 'Midas', portfolio: null, ...o,
  });

  it('gerçek işlemleri hedef senaryo adıyla etiketleyip kopyalar', () => {
    const rows = buildScenarioCopy([realTx()], 'Sanal');
    expect(rows).toEqual([{
      asset_id: '1', type: 'buy', quantity: 10, price: 305.25,
      date: '2026-06-15', currency: 'TRY', broker: 'Midas', portfolio: 'Sanal',
    }]);
  });

  it('id ve user_id gibi DB alanlarını taşımaz — girdide olsa bile çıktıda yok', () => {
    const rows = buildScenarioCopy([{ ...realTx(), id: 99, user_id: 'abc' } as never], 'Sanal');
    expect(rows[0]).not.toHaveProperty('id');
    expect(rows[0]).not.toHaveProperty('user_id');
  });

  // Tek gerçek risk (dosya başındaki not): sanal bir işlem başka bir
  // senaryoya sızmamalı. Çağıran yanlışlıkla filtrelenmemiş tüm işlemleri
  // verse bile bu fonksiyon kendini korumalı.
  it('girdideki sanal işlemleri sessizce atlar, kopyalamaz', () => {
    const rows = buildScenarioCopy([realTx(), realTx({ portfolio: 'Eski senaryo' })], 'Sanal');
    expect(rows).toHaveLength(1);
  });

  it('hedef portföy adını normalize eder (baştaki/sondaki boşluk)', () => {
    const rows = buildScenarioCopy([realTx()], '  Sanal  ');
    expect(rows[0].portfolio).toBe('Sanal');
  });

  it('boş girdide boş dizi döner', () => {
    expect(buildScenarioCopy([], 'Sanal')).toEqual([]);
  });
});
