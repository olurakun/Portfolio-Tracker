import { NextResponse } from "next/server";
import { gridToRows } from "../../../lib/importParse";
import { parseCsv, parseXlsx } from "../../../lib/fileGrid";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 });
  }

  const name = file.name.toLowerCase();

  // PDF yerel olarak ayrıştırılamaz; tek yol yapay zekâ ile dönüştürmek.
  if (name.endsWith('.pdf')) {
    return NextResponse.json({
      needsConversion: true,
      reason: 'PDF dosyaları doğrudan okunamıyor.',
    });
  }

  try {
    let grid: unknown[][];
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      grid = parseCsv(await file.text());
    } else if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
      grid = await parseXlsx(await file.arrayBuffer());
    } else {
      return NextResponse.json({ error: 'Desteklenmeyen dosya türü. CSV, Excel veya PDF yükleyin.' }, { status: 400 });
    }

    const { rows, missingColumns } = gridToRows(grid);

    // Şablon başlıkları yoksa bu hata değil, sadece "başka bir format" demek.
    // Kullanıcıya dönüştürme teklif edebilmek için 200 ile dönüyoruz.
    if (missingColumns.length > 0) {
      return NextResponse.json({
        needsConversion: true,
        reason: 'Dosya şablon formatında değil (Sembol, İşlem, Adet, Fiyat, Tarih sütunları bulunamadı).',
      });
    }

    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ error: 'Dosya okunamadı. Formatı kontrol edin.' }, { status: 400 });
  }
}
