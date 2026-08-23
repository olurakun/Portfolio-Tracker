// build-edge-function.mjs'nin dönüşüm mantığını doğrudan test eder — üretilen
// dosyaların gerçek lib/*.ts kaynağıyla senkron kaldığını GARANTİ ETMEZ (o
// betiği çalıştırmaya bağlı), ama dönüşümün kendisinin (uzantı ekleme,
// process.env çevirisi) doğru çalıştığını kilitler.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('build-edge-function', () => {
  it('göreli import\'lara .ts uzantısı ekler, zaten uzantılıya dokunmaz', () => {
    const out = readFileSync('supabase/functions/refresh-prices/_generated/priceFetch.ts', 'utf8');
    expect(out).toContain('from "./fx.ts"');
    expect(out).toContain('from "./ttlCache.ts"');
    expect(out).toContain('from "./tefas.ts"');
    expect(out).toContain('from "./twelvedata.ts"');
    expect(out).not.toMatch(/from ["']\.\/fx["']/); // uzantısız kalmamalı
  });

  it('process.env.X -> Deno.env.get(\'X\') çevirir', () => {
    const out = readFileSync('supabase/functions/refresh-prices/_generated/twelvedata.ts', 'utf8');
    expect(out).toContain("Deno.env.get('TWELVE_DATA_API_KEY')");
    expect(out).toContain("Deno.env.get('TWELVE_DATA_ENABLED')");
    expect(out).not.toMatch(/process\.env\.[A-Z]/); // yalnızca kod kullanımı; başlık yorumundaki genel bahis hariç
  });

  it('Deno.env kullanan dosyaya deno.ns referansı ekler, kullanmayana eklemez', () => {
    const withDeno = readFileSync('supabase/functions/refresh-prices/_generated/twelvedata.ts', 'utf8');
    expect(withDeno).toContain('/// <reference lib="deno.ns" />');
    const withoutDeno = readFileSync('supabase/functions/refresh-prices/_generated/fx.ts', 'utf8');
    expect(withoutDeno).not.toContain('/// <reference');
  });

  it('üretilen dosya "elle düzenleme" uyarısı taşır', () => {
    const out = readFileSync('supabase/functions/refresh-prices/_generated/fx.ts', 'utf8');
    expect(out).toMatch(/ÜRETİLDİ.*ELLE DÜZENLEME/);
  });

});
