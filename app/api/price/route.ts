import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase().trim();
  const type = searchParams.get("type");

  if (!symbol) return NextResponse.json({ price: 0 });

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Referer': 'https://www.tefas.gov.tr/',
    'Origin': 'https://www.tefas.gov.tr',
    'X-Requested-With': 'XMLHttpRequest', // TEFAS API'sinin en çok sevdiği başlık
    'Accept': 'application/json, text/javascript, */*; q=0.01'
  };

  try {
    // 1. DÖVİZ
    if (type === "currency") {
      const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${symbol}`, { cache: 'no-store' });
      const data = await res.json();
      if (data?.rates?.TRY) return NextResponse.json({ price: parseFloat(data.rates.TRY) });
    }

    // 2. FONLAR - TEFAS Doğrudan Erişim
    if (type === "fund") {
      try {
        const res = await fetch("https://www.tefas.gov.tr/api/Teias/GetFundPriceList", {
          method: 'POST', // TEFAS API POST ister
          headers: headers,
          cache: 'no-store'
        });

        const data = await res.json();
        
        if (data && Array.isArray(data)) {
          const fund = data.find((f: any) => f.fundCode.toUpperCase() === symbol);
          if (fund) {
            return NextResponse.json({ price: parseFloat(fund.price) });
          }
        }
      } catch (e) {
        console.error("[TEFAS API HATA]:", e);
      }
    }

    // 3. HİSSE SENETLERİ
    let querySymbol = symbol.endsWith('.IS') ? symbol : `${symbol}.IS`;
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}`, { cache: 'no-store' });
    const data = await res.json();
    if (data.chart?.result?.[0]?.meta?.regularMarketPrice) {
      return NextResponse.json({ price: data.chart.result[0].meta.regularMarketPrice });
    }
    
    return NextResponse.json({ price: 0 });
  } catch (error) {
    return NextResponse.json({ price: 0 });
  }
}