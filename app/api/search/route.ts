import { NextResponse } from "next/server";

// Yahoo Finance arama sonuçlarını kendi varlık tipimize (stock/fund/currency/metal)
// ve fiyat API'sinin beklediği sembol formatına çevirir.
function classify(q: any): { symbol: string; type: string } {
  const rawSymbol: string = q.symbol;
  const quoteType: string = q.quoteType;

  if (quoteType === "CURRENCY") {
    // Yahoo döviz sembolleri "USDTRY=X" gibi 6 haneli parite formatındadır.
    // Değerli madenler de Yahoo'da CURRENCY olarak (XAUUSD=X gibi) geçer.
    const base = rawSymbol.replace("=X", "").slice(0, 3).toUpperCase();
    if (base === "XAU" || base === "XAG") {
      return { symbol: base, type: "metal" };
    }
    return { symbol: base, type: "currency" };
  }

  if (quoteType === "MUTUALFUND" || quoteType === "ETF") {
    return { symbol: rawSymbol, type: "fund" };
  }

  // EQUITY, INDEX ve diğer her şey: hisse.
  // ÖNEMLİ: borsa soneki (THYAO.IS gibi) burada KORUNUR — fiyat API'sinin
  // doğru borsadan veri çekebilmesi buna bağlı. Daha önce bu sonek siliniyor,
  // sonra fiyat tarafında körlemesine ".IS" ekleniyordu; bu da yabancı
  // hisselerin (AAPL, TSLA vb.) hiç çalışmamasına sebep oluyordu.
  return { symbol: rawSymbol, type: "stock" };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) return NextResponse.json({ results: [] });

  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`, {
      cache: 'no-store'
    });
    const data = await res.json();

    const results = (data.quotes || [])
      .filter((q: any) => q.symbol && q.quoteType)
      .map((q: any) => {
        const { symbol, type } = classify(q);
        return {
          symbol,
          name: q.longname || q.shortname || q.symbol,
          type,
        };
      });

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ results: [] });
  }
}