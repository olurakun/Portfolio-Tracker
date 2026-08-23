import { describe, it, expect, afterEach } from 'vitest';
import { twelveDataSymbol, twelveDataConfigured } from './twelvedata';

describe('twelveDataSymbol', () => {
  // Yahoo BIST sembollerini "THYAO.IS" diye tutuyor, Twelve Data ise çıplak
  // "THYAO" istiyor — sonek gönderilirse 404 dönüyor (ölçüldü).
  it('BIST sembollerinden .IS sonekini atar', () => {
    expect(twelveDataSymbol('THYAO.IS', 'stock')).toBe('THYAO');
    expect(twelveDataSymbol('info.is', 'stock')).toBe('INFO');
  });

  it('soneksiz sembolü olduğu gibi bırakır', () => {
    expect(twelveDataSymbol('AAPL', 'stock')).toBe('AAPL');
    expect(twelveDataSymbol('THYAO', 'stock')).toBe('THYAO');
  });

  // Madenler forex çifti olarak fiyatlanıyor; gram/ons ayrımı çağıranda
  // yapıldığı için ikisi de aynı sembole çözülür.
  it('madenleri USD paritesine çevirir, gram ve ons aynı sembole gider', () => {
    expect(twelveDataSymbol('XAU', 'metal')).toBe('XAU/USD');
    expect(twelveDataSymbol('XAUOZ', 'metal')).toBe('XAU/USD');
    expect(twelveDataSymbol('XAG', 'metal')).toBe('XAG/USD');
  });

  it('tanınmayan madeni aramaz', () => {
    expect(twelveDataSymbol('XPT', 'metal')).toBeNull();
  });

  // Portföydeki 82 sembolün 54'ü TEFAS fonu ve Twelve Data bunları HİÇ
  // kapsamıyor (doğrulandı: AFA/TLY/TTE aramaları 0 Türk sonucu döndü).
  // Boşuna kredi yakmamak için hiç sorulmuyorlar.
  it('fon ve dövizi Twelve Data\'ya hiç sormaz', () => {
    expect(twelveDataSymbol('AFA', 'fund')).toBeNull();
    expect(twelveDataSymbol('USD', 'currency')).toBeNull();
  });

  it('boş sembol null döner', () => {
    expect(twelveDataSymbol('   ', 'stock')).toBeNull();
  });
});

describe('twelveDataConfigured', () => {
  const saved = { key: process.env.TWELVE_DATA_API_KEY, on: process.env.TWELVE_DATA_ENABLED };
  afterEach(() => {
    process.env.TWELVE_DATA_API_KEY = saved.key;
    process.env.TWELVE_DATA_ENABLED = saved.on;
  });

  // ASIL HATA: yalnızca anahtara bakılıyordu ve .env.local'de duran ücretsiz
  // deneme anahtarı yüzünden geçiş kimse istemeden aktifleşip kota harcadı.
  it('anahtar dolu ama bayrak kapalıysa KULLANILMAZ', () => {
    process.env.TWELVE_DATA_API_KEY = 'x'.repeat(32);
    process.env.TWELVE_DATA_ENABLED = 'false';
    expect(twelveDataConfigured()).toBe(false);
  });

  it('bayrak hiç tanımlı değilse KULLANILMAZ', () => {
    process.env.TWELVE_DATA_API_KEY = 'x'.repeat(32);
    delete process.env.TWELVE_DATA_ENABLED;
    expect(twelveDataConfigured()).toBe(false);
  });

  it('bayrak açık ama anahtar yoksa KULLANILMAZ', () => {
    delete process.env.TWELVE_DATA_API_KEY;
    process.env.TWELVE_DATA_ENABLED = 'true';
    expect(twelveDataConfigured()).toBe(false);
  });

  it('ikisi de varsa kullanılır', () => {
    process.env.TWELVE_DATA_API_KEY = 'x'.repeat(32);
    process.env.TWELVE_DATA_ENABLED = 'true';
    expect(twelveDataConfigured()).toBe(true);
  });
});
