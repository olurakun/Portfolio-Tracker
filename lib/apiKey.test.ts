import { describe, it, expect } from 'vitest';
import { isApiKeyFormat, maskApiKey } from './apiKey';

describe('isApiKeyFormat', () => {
  it('Anthropic anahtar biçimini kabul eder', () => {
    expect(isApiKeyFormat('sk-ant-api03-' + 'a'.repeat(30))).toBe(true);
    expect(isApiKeyFormat('  sk-ant-' + 'A1b2_c-3'.repeat(4) + '  ')).toBe(true);
  });

  // Yanlış yapıştırılan metin ağ isteğine hiç çıkmasın diye erken elenir.
  it('başka sağlayıcıların ve bozuk metinlerin anahtarını reddeder', () => {
    expect(isApiKeyFormat('sk-proj-abc123')).toBe(false);
    expect(isApiKeyFormat('sk-ant-kisa')).toBe(false);
    expect(isApiKeyFormat('')).toBe(false);
    expect(isApiKeyFormat('anahtarım')).toBe(false);
  });
});

describe('maskApiKey', () => {
  // Anahtar ekranda hiçbir zaman tam görünmemeli.
  it('yalnızca baş ve son birkaç karakteri gösterir', () => {
    const key = 'sk-ant-api03-' + 'x'.repeat(30) + 'ab7f';
    const masked = maskApiKey(key);
    expect(masked).toContain('sk-ant-api');
    expect(masked).toContain('ab7f');
    expect(masked).not.toContain('x'.repeat(30));
  });

  it('kısa değeri tamamen gizler', () => {
    expect(maskApiKey('sk-ant')).toBe('••••');
  });
});
