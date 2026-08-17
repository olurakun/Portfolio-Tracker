import ExcelJS from "exceljs";

// İçe aktarma şablonunu uygulama içinde üretiyoruz ki parser'ın (app/api/import/route.ts)
// beklediği başlıklarla her zaman birebir aynı kalsın — statik bir dosya zamanla eskir.
const HEADERS = ['Sembol', 'İşlem', 'Adet', 'Fiyat', 'Tarih', 'Para Birimi'];

const EXAMPLE_ROWS = [
  ['THYAO', 'Alım', 100, 305.25, '15.06.2026', 'TRY'],
  ['AAPL', 'Alım', 10, 296.42, '20.06.2026', 'USD'],
  ['THYAO', 'Satım', 40, 318.00, '01.07.2026', 'TRY'],
  ['TLY', 'Alım', 5, 7369.52, '14.07.2026', 'TRY'],
  ['XAU', 'Alım', 20, 6832.11, '01.08.2026', 'TRY'],
];

const NOTES = [
  ['Sütun', 'Açıklama'],
  ['Sembol', 'Varlığın kodu. Hisse: THYAO, AAPL · Fon: TLY · Döviz: USD, EUR · Maden: XAU (altın), XAG (gümüş). Yabancı borsalar için gerekiyorsa sonek kullanın (ör. THYAO.IS).'],
  ['İşlem', 'Alım veya Satım. "Alış", "Satış", "Buy", "Sell" de kabul edilir.'],
  ['Adet', 'Sıfırdan büyük sayı. Ondalık için virgül veya nokta kullanabilirsiniz (1.234,56 ya da 1234.56).'],
  ['Fiyat', 'Birim fiyat (adet başına), işlem para biriminde. Toplam tutar değil.'],
  ['Tarih', 'GG.AA.YYYY (15.06.2026) veya YYYY-AA-GG (2026-06-15).'],
  ['Para Birimi', 'Fiyatın hangi para biriminde olduğu: TRY veya USD. ABD borsalarındaki hisseler (AAPL, SCHD, UNH...) genelde USD, BIST hisseleri ve TEFAS fonları TRY. Boş bırakılırsa TRY varsayılır — yanlış olursa kâr/zarar tamamen hatalı çıkar.'],
  ['', ''],
  ['Not', 'Başlık satırını silmeyin. Örnek satırların yerine kendi işlemlerinizi yazın.'],
  ['Not', 'Portföyde olmayan bir sembol girerseniz, içe aktarma sırasında onu yeni varlık olarak eklemeniz istenecek.'],
];

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Portföy Takip';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('İşlemler');
  sheet.columns = [
    { key: 'symbol', width: 14 },
    { key: 'type', width: 12 },
    { key: 'quantity', width: 12 },
    { key: 'price', width: 14 },
    { key: 'date', width: 14 },
    { key: 'currency', width: 14 },
  ];

  const headerRow = sheet.addRow(HEADERS);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 20;

  EXAMPLE_ROWS.forEach(row => sheet.addRow(row));

  // Örnek satırları gri/italik göstererek "bunlar silinecek örnek" mesajını veriyoruz.
  for (let i = 2; i <= EXAMPLE_ROWS.length + 1; i++) {
    sheet.getRow(i).font = { italic: true, color: { argb: 'FF888888' } };
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const notesSheet = workbook.addWorksheet('Açıklama');
  notesSheet.columns = [{ width: 14 }, { width: 110 }];
  NOTES.forEach(row => notesSheet.addRow(row));
  notesSheet.getRow(1).font = { bold: true };
  notesSheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="portfoy-takip-islem-sablonu.xlsx"',
    },
  });
}
