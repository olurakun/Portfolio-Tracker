import { describe, it, expect } from 'vitest';
import { fxRateUrl, fxSeriesUrl, readRate } from './fx';

describe('fxRateUrl', () => {
  // Güncel ve geçmiş kur AYNI kaynaktan gelmeli; tek fark adresteki tarih.
  it('tarih verilmezse en son kuru ister', () => {
    expect(fxRateUrl(null, 'USD', 'TRY')).toBe('https://api.frankfurter.dev/v1/latest?from=USD&to=TRY');
  });

  it('tarih verilirse o günün kurunu ister', () => {
    expect(fxRateUrl('2026-06-15', 'USD', 'TRY'))
      .toBe('https://api.frankfurter.dev/v1/2026-06-15?from=USD&to=TRY');
  });

  it('birden fazla hedef para birimini tek çağrıda ister', () => {
    expect(fxRateUrl(null, 'EUR', ['TRY', 'USD'])).toContain('to=TRY%2CUSD');
  });
});

describe('fxSeriesUrl', () => {
  it('tarih aralığını tek adreste birleştirir', () => {
    expect(fxSeriesUrl('2026-01-01', '2026-06-15', 'USD', 'TRY'))
      .toBe('https://api.frankfurter.dev/v1/2026-01-01..2026-06-15?from=USD&to=TRY');
  });
});

describe('readRate', () => {
  it('istenen kuru okur', () => {
    expect(readRate({ rates: { TRY: 48.066 } }, 'TRY')).toBe(48.066);
  });

  // Servis hata döndürdüğünde ya da alan eksik olduğunda sessizce 0'a
  // düşmemeli: 0 kur, portföyde sahte bir kayıp gibi görünür.
  it('eksik veya geçersiz değerde null döner', () => {
    expect(readRate({ rates: {} }, 'TRY')).toBeNull();
    expect(readRate({ rates: { TRY: 'x' } }, 'TRY')).toBeNull();
    expect(readRate({ rates: { TRY: Infinity } }, 'TRY')).toBeNull();
    expect(readRate({ error: 'not found' }, 'TRY')).toBeNull();
    expect(readRate(null, 'TRY')).toBeNull();
  });
});
