#!/usr/bin/env node
// Next.js'teki (lib/*.ts) fiyat çekme mantığını Supabase Edge Function'ının
// çalışma ortamına (Deno) uyarlanmış kopyalar olarak üretir.
//
// NEDEN GEREKLİ: Vercel'e henüz deploy edilmedi, yani zamanlanmış işin
// çağırabileceği bir Next.js API rotası yok — mantığın kendisi Edge
// Function'ın içinde çalışmak zorunda. Ama Deno, Node'dan iki noktada
// ayrılıyor: (1) göreli import'larda dosya uzantısı ZORUNLU ("./fx" değil
// "./fx.ts" olmalı), (2) process.env yok, Deno.env.get(...) kullanılıyor.
//
// Elle kopyalamak yerine bu betik var ki KAYNAK HER ZAMAN lib/*.ts kalsın —
// oradaki bir değişiklik `npm run build:edge` ile mekanik olarak buraya
// yansır, iki kopya birbirinden habersiz sürüklenemez.
//
// Vercel'e deploy edilince bu dosyanın amacı değişecek: zamanlayıcı Next.js
// API rotasını çağırmaya döner, bu üretilmiş kopyalar gereksiz kalır.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, 'supabase/functions/refresh-prices/_generated');

// Sıra önemli değil (her dosya kendi görece import'unu çözüyor), ama okunurluk
// için bağımlılık sırasına yakın tutuldu.
const SOURCE_FILES = ['limit.ts', 'ttlCache.ts', 'fx.ts', 'tefas.ts', 'twelvedata.ts', 'priceFetch.ts'];

function transform(src, filename) {
  let out = src;

  // 1) Göreli import/export'lara .ts uzantısı ekle. Zaten uzantılıysa
  //    (örn. başka paket importu) dokunulmaz — yalnızca "./x" veya "../x"
  //    biçimindeki yerel modül yolları hedefleniyor.
  out = out.replace(
    /((?:import|export)[^'"]*?from\s+)(['"])(\.\.?\/[^'"]+?)\2/g,
    (match, prefix, quote, path) => {
      if (path.endsWith('.ts')) return match;
      return `${prefix}${quote}${path}.ts${quote}`;
    }
  );

  // 2) process.env.X -> Deno.env.get('X'). Yalnızca twelvedata.ts'te var.
  const usesDenoEnv = /process\.env\.[A-Z0-9_]+/.test(out);
  out = out.replace(/process\.env\.([A-Z0-9_]+)/g, (_, name) => `Deno.env.get('${name}')`);

  // 2b) Deno.env kullanan dosyalara ad hoc tip referansı eklenir; standalone
  //     `deno check` bu olmadan "Cannot find name 'Deno'" veriyor (yalnızca
  //     statik kontrol aracının bir tuhaflığı — gerçek Edge Function ortamında
  //     Deno namespace zaten global). Girişte (index.ts) de var, burada olması
  //     bu dosya tek başına kontrol edilirse de doğrulanabilsin diye.
  if (usesDenoEnv) out = '/// <reference lib="deno.ns" />\n' + out;

  // 3) İzlenebilirlik: dosyanın üretilmiş olduğunu ve gerçek kaynağı belirt.
  const header = `// ÜRETİLDİ — ELLE DÜZENLEME. Kaynak: lib/${filename}\n` +
    `// Bu dosyayı DEĞİL, kaynağı düzenleyip \`npm run build:edge\` çalıştırın.\n` +
    `// Dönüşüm: göreli import'lara .ts uzantısı eklendi, process.env ->\n` +
    `// Deno.env.get çevrildi (bkz. scripts/build-edge-function.mjs).\n\n`;

  return header + out;
}

mkdirSync(OUT_DIR, { recursive: true });

for (const filename of SOURCE_FILES) {
  const src = readFileSync(join(ROOT, 'lib', filename), 'utf8');
  const out = transform(src, filename);
  writeFileSync(join(OUT_DIR, filename), out, 'utf8');
  console.log(`  lib/${filename} -> supabase/functions/refresh-prices/_generated/${filename}`);
}
console.log(`\n${SOURCE_FILES.length} dosya üretildi.`);
