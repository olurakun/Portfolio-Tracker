import { describe, it, expect } from 'vitest';
import {
  REAL, DEFAULT_SCENARIO, normalizePortfolio, portfolioKey, isReal,
  filterByPortfolio, scenariosOf, portfolioLabel,
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
