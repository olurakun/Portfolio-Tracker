import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export type ParsedRow = {
  row: number;
  symbol: string;
  type: 'buy' | 'sell' | 'dividend';
  quantity: number;
  price: number;
  date: string;
  currency: string;
  error?: string;
};

const HEADER_ALIASES: Record<string, string[]> = {
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

function parseCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = fold(value).replace(/[^a-z₺$]/g, '');
  if (!clean) return null;
  return CURRENCY_ALIASES[clean] ?? null;
}

// JS'in varsayılan toLowerCase'i Türkçe'de bozuk sonuç verir ("İ" → noktalı i,
// "I" → "i" ama "ı" beklenir). Karşılaştırmadan önce Türkçe harfleri ASCII'ye katlarız.
const TURKISH_FOLD: Record<string, string> = {
  'İ': 'i', 'I': 'i', 'ı': 'i', 'Ş': 's', 'ş': 's', 'Ğ': 'g', 'ğ': 'g',
  'Ü': 'u', 'ü': 'u', 'Ö': 'o', 'ö': 'o', 'Ç': 'c', 'ç': 'c',
};

function fold(value: string): string {
  return value.trim().replace(/[İIıŞşĞğÜüÖöÇç]/g, c => TURKISH_FOLD[c]).toLowerCase();
}

function normalizeHeader(value: string): string | null {
  const clean = fold(value.toString());
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(a => fold(a) === clean)) return field;
  }
  return null;
}

// Türkçe Excel çıktılarında ondalık ayırıcı virgül, binlik ayırıcı nokta olabiliyor
// ("1.234,56"); İngilizce çıktılarda tam tersi. Son görülen ayırıcıyı ondalık kabul ederiz.
function parseNumber(value: unknown): number | null {
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

function parseDate(value: unknown): string | null {
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

function parseType(value: unknown): 'buy' | 'sell' | 'dividend' | null {
  if (typeof value !== "string") return null;
  const clean = fold(value);
  if (['alim', 'alis', 'al', 'buy', 'b'].includes(clean)) return 'buy';
  if (['satim', 'satis', 'sat', 'sell', 's'].includes(clean)) return 'sell';
  if (['temettu', 'kar payi', 'dividend', 'div'].includes(clean)) return 'dividend';
  return null;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map(c => c.trim());
}

function parseCsv(text: string): unknown[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const candidates = [';', ',', '\t'];
  const delimiter = candidates.reduce((best, d) =>
    splitCsvLine(lines[0], d).length > splitCsvLine(lines[0], best).length ? d : best, candidates[0]);
  return lines.map(line => splitCsvLine(line, delimiter));
}

async function parseXlsx(buffer: ArrayBuffer): Promise<unknown[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const grid: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v && typeof v === "object" && "result" in v) cells.push((v as { result: unknown }).result);
      else if (v && typeof v === "object" && "text" in v) cells.push((v as { text: unknown }).text);
      else cells.push(v);
    });
    grid.push(cells);
  });
  return grid;
}

function gridToRows(grid: unknown[][]): { rows: ParsedRow[]; missingColumns: string[] } {
  if (grid.length < 2) return { rows: [], missingColumns: [] };

  const headerCells = grid[0].map(c => (c ?? '').toString());
  const columnIndex: Record<string, number> = {};
  headerCells.forEach((cell, i) => {
    const field = normalizeHeader(cell);
    if (field && !(field in columnIndex)) columnIndex[field] = i;
  });

  const required = ['symbol', 'type', 'quantity', 'price', 'date'];
  const missingColumns = required.filter(f => !(f in columnIndex));
  if (missingColumns.length > 0) return { rows: [], missingColumns };

  const rows: ParsedRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i];
    const rawSymbol = (cells[columnIndex.symbol] ?? '').toString().trim().toUpperCase();
    if (!rawSymbol) continue;

    const type = parseType((cells[columnIndex.type] ?? '').toString());
    const quantity = parseNumber(cells[columnIndex.quantity]);
    const price = parseNumber(cells[columnIndex.price]);
    const date = parseDate(cells[columnIndex.date] instanceof Date ? cells[columnIndex.date] : (cells[columnIndex.date] ?? '').toString());
    // Para birimi sütunu yoksa TRY varsayılır; kullanıcı önizlemede sembol bazında değiştirebilir.
    const currency = 'currency' in columnIndex
      ? parseCurrency((cells[columnIndex.currency] ?? '').toString())
      : null;

    const problems: string[] = [];
    if (!type) problems.push('işlem tipi okunamadı');
    // Temettüde adet kavramı yok: tutarın tamamı fiyat alanında, adet 1 kabul edilir.
    if (type !== 'dividend' && (quantity === null || quantity <= 0)) problems.push('adet okunamadı');
    if (price === null || price < 0) problems.push('fiyat okunamadı');
    if (!date) problems.push('tarih okunamadı');

    rows.push({
      row: i + 1,
      symbol: rawSymbol,
      type: type ?? 'buy',
      quantity: type === 'dividend' ? 1 : (quantity ?? 0),
      price: price ?? 0,
      date: date ?? '',
      currency: currency ?? 'TRY',
      error: problems.length > 0 ? problems.join(', ') : undefined,
    });
  }
  return { rows, missingColumns: [] };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  try {
    let grid: unknown[][];
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      grid = parseCsv(await file.text());
    } else if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
      grid = await parseXlsx(await file.arrayBuffer());
    } else {
      return NextResponse.json({ error: 'Desteklenmeyen dosya türü. CSV veya XLSX yükleyin.' }, { status: 400 });
    }

    const { rows, missingColumns } = gridToRows(grid);
    if (missingColumns.length > 0) {
      return NextResponse.json({
        error: `Şu sütunlar bulunamadı: ${missingColumns.join(', ')}. Başlık satırında Sembol, İşlem, Adet, Fiyat, Tarih sütunları olmalı.`,
      }, { status: 400 });
    }

    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ error: 'Dosya okunamadı. Formatı kontrol edin.' }, { status: 400 });
  }
}
