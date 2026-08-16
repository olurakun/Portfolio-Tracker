import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) return NextResponse.json({ results: [] });

  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`, {
      cache: 'no-store'
    });
    const data = await res.json();
    
    const results = (data.quotes || []).map((q: any) => ({
      symbol: q.symbol.replace('.IS', ''),
      name: q.longname || q.shortname || q.symbol,
      type: q.quoteType === 'CURRENCY' ? 'currency' : (q.quoteType === 'MUTUALFUND' || q.quoteType === 'ETF') ? 'fund' : 'stock'
    }));

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ results: [] });
  }
}