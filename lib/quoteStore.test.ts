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

// Tazelik penceresi ile cron sıklığı UYUMLU OLMAK ZORUNDA. İlk hâlde pencere
// 1 saatti ama Hobby planda cron günde bir çalışıyor — depo günün 23 saatinde
// bayat sayılıp hiç kullanılmayacaktı, yani mimari boşa gidecekti.
describe('tazelik penceresi cron sıklığıyla uyumlu mu', () => {
  const H = 60 * 60 * 1000;
  const now = new Date('2026-08-24T12:00:00Z');

  it('günlük cron + 26 saatlik pencere: bir önceki çalışma hâlâ taze', () => {
    // Dün 22:00'de yazıldı, şimdi 12:00 — arada 14 saat var.
    expect(isFresh('2026-08-23T22:00:00Z', 26 * H, now)).toBe(true);
  });

  it('±59 dk sapmayla en kötü aralık (25 saat) hâlâ pencere içinde', () => {
    expect(isFresh('2026-08-23T11:00:00Z', 26 * H, now)).toBe(true);
  });

  it('iş tamamen durursa (2 gün) bayat sayılır, canlıya düşülür', () => {
    expect(isFresh('2026-08-22T10:00:00Z', 26 * H, now)).toBe(false);
  });

  it('1 saatlik pencere günlük cron ile UYUMSUZ olurdu', () => {
    expect(isFresh('2026-08-23T22:00:00Z', 1 * H, now)).toBe(false);
  });
});
