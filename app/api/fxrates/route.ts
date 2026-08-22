import { NextResponse } from "next/server";
import { fxSeriesUrl } from "../../../lib/fx";

// İşlem maliyetlerini hem TL hem USD bazında hesaplayabilmek için her işlem
// tarihindeki USD/TRY kuruna ihtiyaç var. Tarih başına ayrı istek atmak yerine
// Frankfurter'ın zaman serisi ucundan tüm aralığı tek çağrıda alıyoruz.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "start ve end zorunlu (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const res = await fetch(fxSeriesUrl(start, end, 'USD', 'TRY'), {
      cache: 'no-store',
    });
    const data = await res.json();
    const raw = data?.rates ?? {};

    const rates: Record<string, number> = {};
    for (const [date, value] of Object.entries(raw)) {
      const rate = (value as { TRY?: unknown })?.TRY;
      if (typeof rate === "number") rates[date] = rate;
    }

    return NextResponse.json({ rates });
  } catch {
    return NextResponse.json({ rates: {} });
  }
}
