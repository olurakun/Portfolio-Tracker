import { describe, it, expect } from 'vitest';
import { buildRow, gridToRows, parseNumber, parseDate, parseType, parseCurrency } from './importParse';

describe('parseNumber', () => {
  // Türkçe Excel "1.234,56", İngilizce "1,234.56" yazar; ikisi de aynı sayıdır.
  it('Türkçe ve İngilizce ayırıcıları aynı sayıya çevirir', () => {
    expect(parseNumber('1.234,56')).toBe(1234.56);
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseNumber('305,25')).toBe(305.25);
    expect(parseNumber('305.25')).toBe(305.25);
  });

  it('para birimi simgelerini ve boşlukları yok sayar', () => {
    expect(parseNumber('₺ 1.500,00')).toBe(1500);
    expect(parseNumber('$296.42')).toBe(296.42);
  });

  it('okunamayan değerde null döner', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('-')).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });
});

describe('parseDate', () => {
  it('GG.AA.YYYY ve YYYY-AA-GG formatlarını okur', () => {
    expect(parseDate('15.06.2026')).toBe('2026-06-15');
    expect(parseDate('5/6/2026')).toBe('2026-06-05');
    expect(parseDate('2026-06-15')).toBe('2026-06-15');
  });

  it('Date nesnesini ISO tarihe çevirir', () => {
    expect(parseDate(new Date('2026-06-15T10:00:00Z'))).toBe('2026-06-15');
  });

  it('tanımadığı formatta null döner', () => {
    expect(parseDate('15 Haziran 2026')).toBeNull();
  });
});

describe('parseType', () => {
  it('Türkçe ve İngilizce eş anlamlıları tanır', () => {
    expect(parseType('Alım')).toBe('buy');
    expect(parseType('ALIŞ')).toBe('buy');
    expect(parseType('Satım')).toBe('sell');
    expect(parseType('sell')).toBe('sell');
    expect(parseType('Temettü')).toBe('dividend');
  });

  it('bilinmeyen tipte null döner', () => {
    expect(parseType('virman')).toBeNull();
  });
});

describe('parseCurrency', () => {
  it('yaygın yazımları ISO koda çevirir', () => {
    expect(parseCurrency('TL')).toBe('TRY');
    expect(parseCurrency('₺')).toBe('TRY');
    expect(parseCurrency('Dolar')).toBe('USD');
    expect(parseCurrency('$')).toBe('USD');
  });

  // Desteklenmeyen para birimi TRY'ye düşürülmemeli — sessizce yanlış
  // maliyet üretir. null dönüp çağıranın karar vermesi gerekir.
  it('desteklenmeyen para biriminde null döner', () => {
    expect(parseCurrency('EUR')).toBeNull();
  });
});

describe('buildRow', () => {
  const base = { symbol: 'thyao', type: 'Alım', quantity: '100', price: '305,25', date: '15.06.2026', currency: 'TL' };

  it('geçerli satırı normalleştirir', () => {
    expect(buildRow(2, base)).toEqual({
      row: 2, symbol: 'THYAO', type: 'buy', quantity: 100,
      price: 305.25, date: '2026-06-15', currency: 'TRY', error: undefined,
    });
  });

  it('sembolsüz satırı yok sayar', () => {
    expect(buildRow(2, { ...base, symbol: '   ' })).toBeNull();
  });

  // Temettüde adet kavramı yok: tutarın tamamı fiyat alanında durur.
  it('temettüde adedi 1 kabul eder ve boş adet hata sayılmaz', () => {
    const row = buildRow(2, { ...base, type: 'Temettü', quantity: '' })!;
    expect(row.type).toBe('dividend');
    expect(row.quantity).toBe(1);
    expect(row.error).toBeUndefined();
  });

  it('alım/satımda adet yoksa hata işaretler', () => {
    expect(buildRow(2, { ...base, quantity: '' })!.error).toContain('adet');
  });

  // Hatalı satır DÜŞÜRÜLMEZ; kullanıcı önizlemede neyin atlanacağını görmeli.
  it('okunamayan alanları tek tek raporlar ama satırı korur', () => {
    const row = buildRow(7, { symbol: 'AAPL', type: 'virman', quantity: 'x', price: '', date: 'dün' })!;
    expect(row.row).toBe(7);
    expect(row.symbol).toBe('AAPL');
    expect(row.error).toContain('işlem tipi');
    expect(row.error).toContain('fiyat');
    expect(row.error).toContain('tarih');
  });

  // Para birimi yanlış olursa kâr/zarar tamamen yanlış çıkar; belirtilmemişse
  // TRY varsayılır ve kullanıcı önizlemede düzeltir.
  it('para birimi yoksa TRY varsayar', () => {
    expect(buildRow(2, { ...base, currency: undefined })!.currency).toBe('TRY');
  });

  it('USD fiyatı TRY sanmaz', () => {
    expect(buildRow(2, { ...base, currency: 'USD' })!.currency).toBe('USD');
  });
});

describe('gridToRows', () => {
  const grid = [
    ['Sembol', 'İşlem', 'Adet', 'Fiyat', 'Tarih', 'Para Birimi'],
    ['THYAO', 'Alım', '100', '305,25', '15.06.2026', 'TRY'],
    ['AAPL', 'Alım', '10', '296.42', '20.06.2026', 'USD'],
  ];

  it('şablon başlıklarını okur', () => {
    const { rows, missingColumns } = gridToRows(grid);
    expect(missingColumns).toEqual([]);
    expect(rows.map(r => r.symbol)).toEqual(['THYAO', 'AAPL']);
    expect(rows[1].currency).toBe('USD');
  });

  it('başlık eş anlamlılarını tanır', () => {
    const { rows } = gridToRows([
      ['Hisse', 'Yön', 'Miktar', 'Birim Fiyat', 'İşlem Tarihi'],
      ['ASELS', 'Satış', '50', '212,80', '2026-07-01'],
    ]);
    expect(rows[0]).toMatchObject({ symbol: 'ASELS', type: 'sell', quantity: 50, price: 212.8 });
  });

  it('eksik sütunları bildirir', () => {
    const { rows, missingColumns } = gridToRows([
      ['Sembol', 'Adet'],
      ['THYAO', '100'],
    ]);
    expect(rows).toEqual([]);
    expect(missingColumns).toEqual(['type', 'price', 'date']);
  });

  it('boş sembollü satırları atlar', () => {
    const { rows } = gridToRows([...grid, ['', '', '', '', '', '']]);
    expect(rows).toHaveLength(2);
  });

  // Satır numarası dosyadaki gerçek satırı göstermeli — kullanıcı hatalı satırı
  // dosyasında bulabilsin.
  it('dosyadaki satır numarasını korur', () => {
    const { rows } = gridToRows(grid);
    expect(rows.map(r => r.row)).toEqual([2, 3]);
  });
});
