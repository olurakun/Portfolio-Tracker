import { describe, it, expect } from 'vitest';
import { fold } from './turkish';

describe('fold', () => {
  // Asıl mesele bu: Türkçe locale'de küçültme "MIDAS" ile "Midas"ı ayırır,
  // varsayılan locale ise "İ"yi bozar. İkisi de eşleştirme için yanlış.
  it('aynı kelimenin farklı yazımlarını aynı anahtara indirger', () => {
    expect(fold('MIDAS')).toBe(fold('Midas'));
    expect(fold('İŞ YATIRIM')).toBe(fold('iş yatırım'));
    expect(fold('ÇİÇEK')).toBe(fold('çiçek'));
  });

  it('Türkçe harfleri ASCII karşılığına katlar', () => {
    expect(fold('İş Yatırım')).toBe('is yatirim');
    expect(fold('Gümüş')).toBe('gumus');
    expect(fold('ÖZKAN')).toBe('ozkan');
  });

  it('baştaki ve sondaki boşluğu atar', () => {
    expect(fold('  Midas  ')).toBe('midas');
  });

  it('farklı kelimeleri karıştırmaz', () => {
    expect(fold('Midas')).not.toBe(fold('Matriks'));
  });
});
