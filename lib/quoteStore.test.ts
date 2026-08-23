import { describe, it, expect } from 'vitest';
import { quoteKey, isFresh } from './quoteStore';

describe('quoteKey', () => {
  it('sembolü büyük harfe çevirir, tiple birleştirir', () => {
    expect(quoteKey('thyao', 'stock')).toBe('THYAO:stock');
  });

  // Aynı sembol farklı tiplerde olabilir (XAU maden, ama biri kripto diye
  // eklemişse çakışmamalı) — anahtar ikisini birden içermeli.
  it('aynı sembolün farklı tipleri çakışmaz', () => {
    expect(quoteKey('BTC', 'crypto')).not.toBe(quoteKey('BTC', 'stock'));
  });
});

describe('isFresh', () => {
  const now = new Date('2026-08-23T12:00:00Z');
  const hour = 60 * 60 * 1000;

  it('yaş sınırın altındaysa taze', () => {
    expect(isFresh('2026-08-23T11:30:00Z', hour, now)).toBe(true);
  });

  it('yaş sınırı aşarsa bayat', () => {
    expect(isFresh('2026-08-23T10:00:00Z', hour, now)).toBe(false);
  });

  it('tam sınırda taze sayılır', () => {
    expect(isFresh('2026-08-23T11:00:00Z', hour, now)).toBe(true);
  });

  // Zamanlanmış iş durursa kullanıcı bayat fiyat görmemeli; bozuk damga
  // "taze" sayılıp canlı çekimi atlatmamalı.
  it('geçersiz tarih damgası bayat sayılır', () => {
    expect(isFresh('bozuk', hour, now)).toBe(false);
    expect(isFresh('', hour, now)).toBe(false);
  });

  it('saat kayması yüzünden gelecek tarihli satır taze sayılır', () => {
    expect(isFresh('2026-08-23T12:05:00Z', hour, now)).toBe(true);
  });
});
