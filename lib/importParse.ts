// İçe aktarmanın ORTAK doğrulama kapısı. Hem elle hazırlanan şablon dosyaları
// (app/api/import) hem de yapay zekâ ile dönüştürülen dosyalar (app/api/convert)
// buradan geçer — böylece "nereden geldiği" ne olursa olsun bir işlemin
// geçerlilik kuralları tek yerde tanımlı kalır.

import { fold } from './turkish';
export { fold };

export type TxType = 'buy' | 'sell' | 'dividend';

export type ParsedRow = {
  row: number;
  symbol: string;
  type: TxType;
  quantity: number;
  price: number;
  date: string;
  currency: string;
  error?: string;
};

export const HEADER_ALIASES: Record<string, string[]> = {
  symbol: ['sembol', 'symbol', 'hisse', 'kod', 'enstruman', 'enstrüman', 'varlık', 'varlik'],
  type: ['işlem', 'islem', 'işlem tipi', 'islem tipi', 'tip', 'type', 'yön', 'yon', 'işlem türü', 'islem turu'],
  quantity: ['adet', 'miktar', 'quantity', 'lot', 'qty'],
  price: ['fiyat', 'price', 'birim fiyat', 'birim fiyatı', 'birim fiyati', 'tutar/adet'],
  date: ['tarih', 'date', 'işlem tarihi', 'islem tarihi'],
  currency: ['para birimi', 'parabirimi', 'currency', 'döviz', 'doviz', 'kur', 'birim'],
};

// Fiyatın hangi para biriminde olduğu kritik: ABD hisseleri USD, BIST hisseleri TRY
// cinsinden işlem görüyor ve ikisi karıştırılırsa maliyet tamamen yanlış çıkıyor.
const CURRENCY_ALIASES: Record<string, string> = {
  'tl': 'TRY', 'try': 'TRY', '₺': 'TRY', 'turk lirasi': 'TRY', 'türk lirası': 'TRY',
  'usd': 'USD', '$': 'USD', 'dolar': 'USD', 'amerikan dolari': 'USD', 'abd dolari': 'USD',
};

export function parseCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = fold(value).replace(/[^a-z₺$]/g, '');
  if (!clean) return null;
  return CURRENCY_ALIASES[clean] ?? null;
}


export function normalizeHeader(value: string): string | null {
  const clean = fold(value.toString());
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(a => fold(a) === clean)) return field;
  }
  return null;
}

// Türkçe Excel çıktılarında ondalık ayırıcı virgül, binlik ayırıcı nokta olabiliyor
// ("1.234,56"); İngilizce çıktılarda tam tersi. Son görülen ayırıcıyı ondalık kabul ederiz.
export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const clean = value.replace(/[^\d.,-]/g, '').trim();
  if (!clean) return null;
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot
      ? clean.replace(/\./g, '').replace(',', '.')
      : clean.replace(/,/g, '');
  } else if (lastComma > -1) {
    normalized = clean.replace(',', '.');
  } else {
    normalized = clean;
  }
  const num = parseFloat(normalized);
  return isFinite(num) ? num : null;
}

export function parseDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean) return null;
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

export function parseType(value: unknown): TxType | null {
  if (typeof value !== "string") return null;
  const clean = fold(value);
  if (['alim', 'alis', 'al', 'buy', 'b'].includes(clean)) return 'buy';
  if (['satim', 'satis', 'sat', 'sell', 's'].includes(clean)) return 'sell';
  if (['temettu', 'kar payi', 'dividend', 'div'].includes(clean)) return 'dividend';
  return null;
}

export type RawRow = {
  symbol: unknown;
  type: unknown;
  quantity: unknown;
  price: unknown;
  date: unknown;
  currency?: unknown;
};

/**
 * Ham alanları tek bir işleme çevirir. Sembol boşsa satır yok sayılır (null).
 * Okunamayan alanlar satırı DÜŞÜRMEZ; `error` ile işaretlenir ki kullanıcı
 * önizlemede neyin atlanacağını görebilsin — sessizce kaybolan satır en kötüsü.
 */
export function buildRow(rowNumber: number, raw: RawRow): ParsedRow | null {
  const symbol = (raw.symbol ?? '').toString().trim().toUpperCase();
  if (!symbol) return null;

  const type = parseType((raw.type ?? '').toString());
  const quantity = parseNumber(raw.quantity);
  const price = parseNumber(raw.price);
  const date = parseDate(raw.date instanceof Date ? raw.date : (raw.date ?? '').toString());
  const currency = parseCurrency((raw.currency ?? '').toString());

  const problems: string[] = [];
  if (!type) problems.push('işlem tipi okunamadı');
  // Temettüde adet kavramı yok: tutarın tamamı fiyat alanında, adet 1 kabul edilir.
  if (type !== 'dividend' && (quantity === null || quantity <= 0)) problems.push('adet okunamadı');
  if (price === null || price < 0) problems.push('fiyat okunamadı');
  if (!date) problems.push('tarih okunamadı');

  return {
    row: rowNumber,
    symbol,
    type: type ?? 'buy',
    quantity: type === 'dividend' ? 1 : (quantity ?? 0),
    price: price ?? 0,
    date: date ?? '',
    // Para birimi belirtilmemişse TRY varsayılır; kullanıcı önizlemede değiştirebilir.
    currency: currency ?? 'TRY',
    error: problems.length > 0 ? problems.join(', ') : undefined,
  };
}

export const REQUIRED_COLUMNS = ['symbol', 'type', 'quantity', 'price', 'date'];

export function gridToRows(grid: unknown[][]): { rows: ParsedRow[]; missingColumns: string[] } {
  if (grid.length < 2) return { rows: [], missingColumns: REQUIRED_COLUMNS };

  const headerCells = grid[0].map(c => (c ?? '').toString());
  const columnIndex: Record<string, number> = {};
  headerCells.forEach((cell, i) => {
    const field = normalizeHeader(cell);
    if (field && !(field in columnIndex)) columnIndex[field] = i;
  });

  const missingColumns = REQUIRED_COLUMNS.filter(f => !(f in columnIndex));
  if (missingColumns.length > 0) return { rows: [], missingColumns };

  const rows: ParsedRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i];
    const row = buildRow(i + 1, {
      symbol: cells[columnIndex.symbol],
      type: cells[columnIndex.type],
      quantity: cells[columnIndex.quantity],
      price: cells[columnIndex.price],
      date: cells[columnIndex.date],
      currency: 'currency' in columnIndex ? cells[columnIndex.currency] : undefined,
    });
    if (row) rows.push(row);
  }
  return { rows, missingColumns: [] };
}

export type ExistingTx = {
  symbol: string;
  type: string;
  date: string;
  quantity: number | string;
  price: number | string;
  currency?: string | null;
};

/**
 * Bir işlemin kimliği. Aracı kurum ekstrelerinde işlem numarası yok, elimizde
 * yalnızca bu beş alan var. Fiyat ve adet ondalıklı olduğu için yuvarlanır;
 * aksi halde 305.25 ile 305.2500000001 farklı görünürdü.
 */
function txKey(tx: { symbol: string; type: string; date: string; quantity: number | string; price: number | string; currency?: string | null }): string {
  const qty = Number(tx.quantity);
  const price = Number(tx.price);
  return [
    tx.symbol.trim().toUpperCase(),
    tx.type,
    tx.date,
    Number.isFinite(qty) ? qty.toFixed(6) : 'x',
    Number.isFinite(price) ? price.toFixed(6) : 'x',
    (tx.currency || 'TRY').toUpperCase(),
  ].join('|');
}

/**
 * Dosyadaki hangi satırların portföyde ZATEN bulunduğunu işaretler.
 *
 * Aracı kurumlar ekstreyi tarih aralığına göre veriyor ve aralıklar sık sık
 * örtüşüyor; aynı işlemin ikinci kez eklenmesi maliyeti sessizce bozar.
 *
 * Bu bir KESİNLİK DEĞİL sinyaldir: aynı gün aynı fiyattan iki ayrı alım
 * gerçekten olabilir (kısmi gerçekleşen emirler). Bu yüzden eşleşme sayı
 * bazında yapılır — veritabanında bir tane varken dosyada iki tane geçiyorsa
 * yalnızca BİRİ yinelenmiş sayılır, diğeri yeni kayıt olarak kalır. Karar
 * kullanıcınındır; burada yalnızca işaretlenir.
 *
 * Dönen dizi `rows` ile aynı sıradadır.
 */
export function findDuplicateRows(existing: ExistingTx[], rows: ParsedRow[]): boolean[] {
  const remaining = new Map<string, number>();
  for (const tx of existing) {
    const key = txKey(tx);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  return rows.map(row => {
    if (row.error) return false;
    const key = txKey(row);
    const left = remaining.get(key) ?? 0;
    if (left <= 0) return false;
    remaining.set(key, left - 1);
    return true;
  });
}
